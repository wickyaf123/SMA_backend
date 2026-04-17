import { HumanMessage, AIMessage, AIMessageChunk, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { prisma } from '../../../config/database';
import { logger } from '../../../utils/logger';
import { getJerryGraph } from './graph';
import { TurnRecorder } from './turn-recorder';

if (process.env.LANGCHAIN_TRACING_V2 === 'true') {
  logger.info({ project: process.env.LANGCHAIN_PROJECT ?? 'default' }, 'LangSmith tracing enabled');
}

/**
 * Map the incoming raw user string into a LangGraph HumanMessage.
 * Protocol prefixes (BUTTON:, CONFIRM:, FORM:, SYSTEM_EVENT:) are preserved
 * verbatim in content so the router can regex-match them.
 */
function toHumanMessage(raw: string): HumanMessage {
  return new HumanMessage({ content: raw });
}

/**
 * Ensure jerry:confirm / jerry:form / jerry:buttons blocks are wrapped in
 * triple-backtick code fences. Claude sometimes omits the fences, which
 * causes the frontend to render raw JSON.
 */
function ensureJerryBlocksFenced(content: string): string {
  return content.replace(
    /(?:^|\n)\s*jerry:(confirm|form|buttons)\s*\n(\s*\{[\s\S]*?\n\s*\})/gm,
    '\n```jerry:$1\n$2\n```',
  );
}

export interface RunLangGraphTurnParams {
  conversationId: string;
  userId?: string | null;
  userMessage: string;
  userMessageId?: string | null;
  protocol?: string | null;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onToolUse?: (name: string, input: any, toolCallId?: string) => void;
  onToolResult?: (name: string, result: any, toolCallId?: string) => void;
}

export interface RunLangGraphTurnResult {
  finalText: string;
  interrupt: null | {
    actionId: string;
    toolName: string;
    description: string;
  };
}

/**
 * Runs one user turn through the Jerry LangGraph. Streams tokens/tool events
 * via the provided callbacks and returns the final assistant text plus an
 * optional interrupt payload (when the confirm node is waiting on a user
 * confirmation).
 */
export async function runLangGraphTurn(params: RunLangGraphTurnParams): Promise<RunLangGraphTurnResult & { turnId?: string | null }> {
  const { conversationId, userId, userMessage, onToken, onToolUse, onToolResult } = params;
  const graph = await getJerryGraph();

  const recorder = new TurnRecorder({
    conversationId,
    userId: userId ?? null,
    engine: 'langgraph',
    protocol: params.protocol ?? inferProtocol(userMessage),
  });
  await recorder.start();
  if (params.userMessageId) recorder.setUserMessageId(params.userMessageId);

  const config = {
    configurable: {
      thread_id: conversationId,
      conversationId,
      userId: userId ?? undefined,
    },
    recursionLimit: 30,
    signal: params.signal,
  };

  const input = {
    messages: [toHumanMessage(userMessage)],
    conversationId,
    userId: userId ?? null,
  };

  let finalText = '';
  let interruptPayload: RunLangGraphTurnResult['interrupt'] = null;
  const collectedToolCalls: Array<{ id: string; name: string; input: any }> = [];
  const collectedToolResults: Array<{ tool_use_id: string; content: string }> = [];

  try {
    const stream = await graph.streamEvents(input, { ...config, version: 'v2' });

    for await (const event of stream as AsyncIterable<any>) {
      // Break out of the stream if cancelled
      if (params.signal?.aborted) break;
      recorder.onEvent(event);
      const type = event.event;
      if (type === 'on_chat_model_stream') {
        const chunk: AIMessageChunk = event.data?.chunk;
        const txt = typeof chunk?.content === 'string'
          ? chunk.content
          : Array.isArray(chunk?.content)
            ? chunk.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('')
            : '';
        if (txt) {
          finalText += txt;
          onToken?.(txt);
        }
      } else if (type === 'on_tool_start') {
        const name = event.name ?? event.data?.input?.name ?? 'tool';
        const input = event.data?.input ?? {};
        const toolCallId = event.data?.input?.id ?? event.run_id ?? undefined;
        onToolUse?.(name, input, toolCallId);
      } else if (type === 'on_tool_end') {
        const name = event.name ?? 'tool';
        const output = event.data?.output;
        // ToolMessage.content is typically a JSON-encoded string
        let parsed: any = output;
        let toolCallId: string | undefined;
        if (output instanceof ToolMessage) {
          toolCallId = output.tool_call_id ?? undefined;
          try { parsed = JSON.parse(String(output.content)); } catch { parsed = output.content; }
          collectedToolResults.push({
            tool_use_id: output.tool_call_id ?? '',
            content: String(output.content ?? ''),
          });
        }
        onToolResult?.(name, parsed, toolCallId);
      } else if (type === 'on_chain_end' && event.name === 'LangGraph') {
        // Final graph event — capture any interrupt from state snapshot
        const snapshot: any = event.data?.output;
        if (snapshot?.__interrupt__?.length) {
          const ir = snapshot.__interrupt__[0];
          const value = ir.value ?? ir;
          interruptPayload = {
            actionId: value.actionId ?? 'pending',
            toolName: value.toolName ?? 'unknown',
            description: value.description ?? '',
          };
        }
      }
    }

    // Read final state snapshot for tool_calls and any interrupt we missed.
    const snapshot = await graph.getState(config);
    const messages: BaseMessage[] = snapshot.values?.messages ?? [];
    const lastAI = [...messages].reverse().find((m) => m instanceof AIMessage) as AIMessage | undefined;
    if (lastAI) {
      // Prefer the canonical text from the saved state to avoid missing chunks
      const snapshotText = typeof lastAI.content === 'string'
        ? lastAI.content
        : Array.isArray(lastAI.content)
          ? lastAI.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('')
          : '';
      if (snapshotText && snapshotText.length > finalText.length) {
        finalText = snapshotText;
      }
      const tcs = (lastAI as any).tool_calls as Array<{ id: string; name: string; args: any }> | undefined;
      if (tcs?.length) {
        for (const tc of tcs) {
          collectedToolCalls.push({ id: tc.id, name: tc.name, input: tc.args });
        }
      }
    }

    if (!interruptPayload && (snapshot as any).tasks?.length) {
      for (const task of (snapshot as any).tasks) {
        if (task.interrupts?.length) {
          const value = task.interrupts[0].value;
          interruptPayload = {
            actionId: value?.actionId ?? 'pending',
            toolName: value?.toolName ?? 'unknown',
            description: value?.description ?? '',
          };
          break;
        }
      }
    }
  } catch (err: any) {
    logger.error({ err, conversationId }, 'LangGraph streamEvents failed');
    await recorder.finish({ error: err });
    throw err;
  }

  // Safety net: ensure jerry:* interactive blocks are properly fenced so the
  // frontend can always parse them, even if a LangGraph node omits fences.
  finalText = ensureJerryBlocksFenced(finalText);

  // Persist an assistant message for the frontend UI history. We keep the
  // same Prisma schema as the legacy path so the UI doesn't need to change.
  let assistantRow: { id: string } | null = null;
  if (finalText || collectedToolCalls.length) {
    assistantRow = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: finalText,
        toolCalls: collectedToolCalls.length ? (collectedToolCalls as any) : undefined,
        turnId: recorder.turnId ?? undefined,
      },
      select: { id: true },
    });
    if (assistantRow) recorder.setAssistantMessageId(assistantRow.id);
  }
  if (collectedToolResults.length) {
    await prisma.message.create({
      data: {
        conversationId,
        role: 'tool_result',
        content: '',
        toolResults: collectedToolResults as any,
        turnId: recorder.turnId ?? undefined,
      },
    });
  }

  if (interruptPayload) recorder.setInterrupt(interruptPayload.toolName);
  await recorder.finish({ finalText });

  return { finalText, interrupt: interruptPayload, turnId: recorder.turnId ?? null };
}

function inferProtocol(userMessage: string): string {
  if (userMessage.startsWith('BUTTON:')) return 'button';
  if (userMessage.startsWith('CONFIRM:')) return 'confirm';
  if (userMessage.startsWith('FORM:')) return 'form';
  if (userMessage.startsWith('SYSTEM_EVENT:')) return 'system_event';
  return 'user';
}

/**
 * Resume a graph run after a user responds to an interrupt via CONFIRM:<id>:<decision>.
 */
export async function resumeLangGraphConfirmation(params: {
  conversationId: string;
  userId?: string | null;
  decision: 'confirm' | 'cancel';
  onToken?: (token: string) => void;
}) {
  const graph = await getJerryGraph();
  const config = {
    configurable: {
      thread_id: params.conversationId,
      conversationId: params.conversationId,
      userId: params.userId ?? undefined,
    },
    recursionLimit: 30,
  };

  const recorder = new TurnRecorder({
    conversationId: params.conversationId,
    userId: params.userId ?? null,
    engine: 'langgraph',
    protocol: 'confirm_resume',
    confirmDecision: params.decision,
  });
  await recorder.start();

  let finalText = '';
  try {
    const stream = await graph.streamEvents(
      // Command.resume payload — LangGraph passes this into interrupt()
      { resume: { decision: params.decision } } as any,
      { ...config, version: 'v2' },
    );
    for await (const event of stream as AsyncIterable<any>) {
      recorder.onEvent(event);
      if (event.event === 'on_chat_model_stream') {
        const chunk: AIMessageChunk = event.data?.chunk;
        const txt = typeof chunk?.content === 'string' ? chunk.content : '';
        if (txt) {
          finalText += txt;
          params.onToken?.(txt);
        }
      }
    }
  } catch (err: any) {
    logger.error({ err, conversationId: params.conversationId }, 'LangGraph resume failed');
    await recorder.finish({ error: err });
    throw err;
  }

  if (params.decision === 'cancel') recorder.setCancelled();
  await recorder.finish({ finalText });
  return { finalText, turnId: recorder.turnId ?? null };
}
