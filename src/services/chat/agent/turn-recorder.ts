import { prisma } from '../../../config/database';
import { logger } from '../../../utils/logger';

const OBSERVABILITY_ENABLED = (process.env.JERRY_OBSERVABILITY ?? 'on').toLowerCase() !== 'off';
const NODE_NAMES = new Set(['router', 'search', 'campaign', 'general', 'event', 'confirm']);
const PAYLOAD_TRUNCATION_BYTES = 10_000;

export type TurnStatus = 'RUNNING' | 'COMPLETED' | 'INTERRUPTED' | 'CANCELLED' | 'ERRORED';
export type ToolExecStatus =
  | 'SUCCESS'
  | 'VALIDATION_ERROR'
  | 'PRECONDITION_ERROR'
  | 'SERVICE_ERROR'
  | 'INTEGRATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'ZERO_RESULTS';

interface PendingTool {
  toolName: string;
  toolCallId?: string;
  callerNode?: string;
  startedAt: Date;
  input?: any;
  seqStart: number;
}

interface FinishedTool {
  toolName: string;
  toolCallId?: string;
  callerNode?: string;
  input: any;
  output: any;
  status: ToolExecStatus;
  errorCode?: string;
  errorMessage?: string;
  resultCount?: number;
  durationMs: number;
  startedAt: Date;
  endedAt: Date;
}

interface BufferedEvent {
  seq: number;
  type: string;
  node?: string;
  toolName?: string;
  payload?: any;
  createdAt: Date;
}

export interface TurnRecorderInit {
  conversationId: string;
  userId?: string | null;
  engine: 'langgraph' | 'legacy';
  protocol?: string | null;
  confirmDecision?: 'confirm' | 'cancel' | null;
}

/**
 * Captures a single chat turn's observability trace:
 *  - node path + node_enter/exit events
 *  - per-tool executions with duration, status, resultCount
 *  - cumulative Claude token usage
 *  - interrupt / cancel reasons
 *
 * All in-memory; flushed in one prisma.$transaction in finish(). If the flush
 * fails (e.g. tables not migrated yet in a dev env) the original turn still
 * succeeds — we never block a user response on observability writes.
 */
export class TurnRecorder {
  readonly init: TurnRecorderInit;
  turnId: string | null = null;

  private readonly startedAt: Date;
  private endedAt: Date | null = null;
  private userMessageId: string | null = null;
  private assistantMessageId: string | null = null;

  private nodePath: string[] = [];
  private entryNode: string | null = null;
  private exitNode: string | null = null;
  private routerLabel: string | null = null;

  private promptTokens = 0;
  private completionTokens = 0;

  private status: TurnStatus = 'RUNNING';
  private interruptReason: string | null = null;
  private errorMessage: string | null = null;

  private toolCallCount = 0;
  private toolErrorCount = 0;
  private pending = new Map<string, PendingTool>();
  private finishedTools: FinishedTool[] = [];
  private events: BufferedEvent[] = [];
  private eventSeq = 0;

  constructor(init: TurnRecorderInit) {
    this.init = init;
    this.startedAt = new Date();
  }

  get isEnabled(): boolean {
    return OBSERVABILITY_ENABLED;
  }

  /**
   * Insert the ChatTurn row immediately so downstream code can use
   * recorder.turnId as a FK on Message rows. Any error is swallowed.
   */
  async start(): Promise<string | null> {
    if (!OBSERVABILITY_ENABLED) return null;
    try {
      const row = await prisma.chatTurn.create({
        data: {
          conversationId: this.init.conversationId,
          userId: this.init.userId ?? null,
          engine: this.init.engine,
          protocol: this.init.protocol ?? null,
          confirmDecision: this.init.confirmDecision ?? null,
          status: 'RUNNING',
          startedAt: this.startedAt,
        },
      });
      this.turnId = row.id;
      return row.id;
    } catch (err) {
      logger.warn({ err }, 'TurnRecorder.start failed — observability degraded for this turn');
      return null;
    }
  }

  setUserMessageId(id: string) { this.userMessageId = id; }
  setAssistantMessageId(id: string) { this.assistantMessageId = id; }
  setRouterLabel(label: string) {
    this.routerLabel = label;
    this.pushEvent({ type: 'router_decision', payload: { label } });
  }
  setInterrupt(reason: string | null) {
    if (reason) this.interruptReason = reason;
    this.status = 'INTERRUPTED';
    this.pushEvent({ type: 'interrupt', payload: { reason } });
  }
  setCancelled(reason?: string) {
    this.status = 'CANCELLED';
    this.pushEvent({ type: 'cancelled', payload: reason ? { reason } : undefined });
  }
  markError(message: string) {
    this.status = 'ERRORED';
    this.errorMessage = message;
    this.pushEvent({ type: 'error', payload: { message } });
  }

  /**
   * Feed a LangGraph stream event. Safe to call with any event — unknown
   * event types are ignored.
   */
  onEvent(event: any) {
    if (!OBSERVABILITY_ENABLED || !event) return;
    const type = event.event;
    const name = event.name;

    if (type === 'on_chain_start' && typeof name === 'string' && NODE_NAMES.has(name)) {
      this.nodePath.push(name);
      if (!this.entryNode) this.entryNode = name;
      this.exitNode = name;
      this.pushEvent({ type: 'node_enter', node: name });
      return;
    }

    if (type === 'on_chain_end' && typeof name === 'string' && NODE_NAMES.has(name)) {
      this.exitNode = name;
      this.pushEvent({ type: 'node_exit', node: name });
      return;
    }

    if (type === 'on_tool_start') {
      const toolName = name ?? event.data?.input?.name ?? 'tool';
      const runId = event.run_id ?? event.runId ?? `${toolName}-${this.eventSeq}`;
      this.toolCallCount += 1;
      const callerNode = this.nodePath[this.nodePath.length - 1];
      this.pending.set(String(runId), {
        toolName,
        toolCallId: event.data?.input?.id,
        callerNode,
        startedAt: new Date(),
        input: event.data?.input,
        seqStart: this.eventSeq,
      });
      this.pushEvent({ type: 'tool_start', toolName, payload: { runId } });
      return;
    }

    if (type === 'on_tool_end') {
      const runId = event.run_id ?? event.runId;
      const pending = runId ? this.pending.get(String(runId)) : undefined;
      const toolName = pending?.toolName ?? name ?? 'tool';
      const output = event.data?.output;
      const endedAt = new Date();
      const startedAt = pending?.startedAt ?? endedAt;
      const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
      const { status, errorCode, errorMessage, resultCount, parsedOutput } = classifyToolOutput(output);

      if (status !== 'SUCCESS' && status !== 'ZERO_RESULTS') this.toolErrorCount += 1;

      this.finishedTools.push({
        toolName,
        toolCallId: pending?.toolCallId,
        callerNode: pending?.callerNode,
        input: pending?.input,
        output: parsedOutput,
        status,
        errorCode,
        errorMessage,
        resultCount,
        durationMs,
        startedAt,
        endedAt,
      });
      if (runId) this.pending.delete(String(runId));
      this.pushEvent({ type: 'tool_end', toolName, payload: { durationMs, status, resultCount } });
      return;
    }

    if (type === 'on_chat_model_end') {
      const usage = event.data?.output?.usage_metadata
        ?? event.data?.output?.response_metadata?.usage
        ?? event.data?.output?.llmOutput?.tokenUsage;
      if (usage) {
        if (typeof usage.input_tokens === 'number') this.promptTokens += usage.input_tokens;
        if (typeof usage.output_tokens === 'number') this.completionTokens += usage.output_tokens;
        if (typeof usage.promptTokens === 'number') this.promptTokens += usage.promptTokens;
        if (typeof usage.completionTokens === 'number') this.completionTokens += usage.completionTokens;
      }
      return;
    }

    if (type === 'on_chain_end' && name === 'LangGraph') {
      const out: any = event.data?.output;
      const interrupts: any[] = out?.__interrupt__ ?? [];
      if (interrupts.length) {
        const value = interrupts[0]?.value ?? interrupts[0];
        this.setInterrupt(value?.toolName ?? null);
      }
    }
  }

  /**
   * Flush the accumulated trace to Postgres in one transaction.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async finish(opts: { finalText?: string | null; error?: Error | null } = {}): Promise<void> {
    if (!OBSERVABILITY_ENABLED) return;
    if (!this.turnId) return; // start() failed earlier
    if (this.endedAt) return;
    this.endedAt = new Date();

    if (opts.error) this.markError(opts.error.message || 'unknown');
    if (this.status === 'RUNNING') {
      this.status = this.interruptReason ? 'INTERRUPTED' : 'COMPLETED';
    }

    const totalTokens = this.promptTokens + this.completionTokens;
    const durationMs = Math.max(0, this.endedAt.getTime() - this.startedAt.getTime());

    try {
      await prisma.$transaction([
        prisma.chatTurn.update({
          where: { id: this.turnId },
          data: {
            userMessageId: this.userMessageId,
            assistantMessageId: this.assistantMessageId,
            entryNode: this.entryNode,
            exitNode: this.exitNode,
            nodePath: this.nodePath,
            status: this.status as any,
            interruptReason: this.interruptReason,
            routerLabel: this.routerLabel,
            promptTokens: this.promptTokens,
            completionTokens: this.completionTokens,
            totalTokens,
            toolCallCount: this.toolCallCount,
            toolErrorCount: this.toolErrorCount,
            durationMs,
            endedAt: this.endedAt,
            errorMessage: this.errorMessage,
          },
        }),
        prisma.toolExecution.createMany({
          data: this.finishedTools.map((t) => ({
            turnId: this.turnId!,
            conversationId: this.init.conversationId,
            toolName: t.toolName,
            callerNode: t.callerNode ?? null,
            toolCallId: t.toolCallId ?? null,
            input: truncateJson(t.input),
            output: truncateJson(t.output),
            status: t.status as any,
            errorCode: t.errorCode ?? null,
            errorMessage: t.errorMessage ?? null,
            resultCount: t.resultCount ?? null,
            durationMs: t.durationMs,
            startedAt: t.startedAt,
            endedAt: t.endedAt,
          })),
          skipDuplicates: true,
        }),
        prisma.turnEvent.createMany({
          data: this.events.map((e) => ({
            turnId: this.turnId!,
            seq: e.seq,
            type: e.type,
            node: e.node ?? null,
            toolName: e.toolName ?? null,
            payload: e.payload ?? undefined,
            createdAt: e.createdAt,
          })),
          skipDuplicates: true,
        }),
      ]);
    } catch (err) {
      logger.warn({ err, turnId: this.turnId }, 'TurnRecorder.finish flush failed');
    }
  }

  /**
   * Legacy-engine convenience — record a single tool call without the
   * LangGraph event machinery.
   */
  recordLegacyToolStart(toolName: string, input: any): string {
    const id = `legacy-${this.eventSeq}-${toolName}`;
    this.pending.set(id, {
      toolName,
      callerNode: this.nodePath[this.nodePath.length - 1],
      startedAt: new Date(),
      input,
      seqStart: this.eventSeq,
    });
    this.toolCallCount += 1;
    this.pushEvent({ type: 'tool_start', toolName });
    return id;
  }

  recordLegacyToolEnd(id: string, result: any) {
    const pending = this.pending.get(id);
    if (!pending) return;
    const endedAt = new Date();
    const durationMs = Math.max(0, endedAt.getTime() - pending.startedAt.getTime());
    const { status, errorCode, errorMessage, resultCount, parsedOutput } = classifyToolOutput(result);
    if (status !== 'SUCCESS' && status !== 'ZERO_RESULTS') this.toolErrorCount += 1;
    this.finishedTools.push({
      toolName: pending.toolName,
      callerNode: pending.callerNode,
      input: pending.input,
      output: parsedOutput,
      status,
      errorCode,
      errorMessage,
      resultCount,
      durationMs,
      startedAt: pending.startedAt,
      endedAt,
    });
    this.pending.delete(id);
    this.pushEvent({ type: 'tool_end', toolName: pending.toolName, payload: { durationMs, status, resultCount } });
  }

  private pushEvent(evt: Omit<BufferedEvent, 'seq' | 'createdAt'>) {
    this.events.push({
      seq: this.eventSeq++,
      type: evt.type,
      node: evt.node,
      toolName: evt.toolName,
      payload: evt.payload,
      createdAt: new Date(),
    });
  }
}

/**
 * Inspect a tool result (or already-parsed object) and derive status,
 * errorCode, errorMessage, and resultCount when possible.
 */
function classifyToolOutput(output: any): {
  status: ToolExecStatus;
  errorCode?: string;
  errorMessage?: string;
  resultCount?: number;
  parsedOutput: any;
} {
  let parsed: any = output;

  // LangChain ToolMessage — content is typically JSON string
  if (output && typeof output === 'object' && 'content' in output && typeof (output as any).content === 'string') {
    try { parsed = JSON.parse((output as any).content); } catch { parsed = (output as any).content; }
  }
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { /* keep as string */ }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'SUCCESS', parsedOutput: parsed };
  }

  if (parsed.success === false) {
    const code = typeof parsed.code === 'string' ? parsed.code.toUpperCase() : undefined;
    const status: ToolExecStatus =
      code === 'VALIDATION' || code === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR'
      : code === 'PRECONDITION' || code === 'PRECONDITION_ERROR' ? 'PRECONDITION_ERROR'
      : code === 'SERVICE' || code === 'SERVICE_ERROR' ? 'SERVICE_ERROR'
      : code === 'INTEGRATION' || code === 'INTEGRATION_ERROR' ? 'INTEGRATION_ERROR'
      : 'INTERNAL_ERROR';
    return {
      status,
      errorCode: code,
      errorMessage: typeof parsed.error === 'string' ? parsed.error : undefined,
      parsedOutput: parsed,
    };
  }

  const resultCount = deriveResultCount(parsed);
  if (typeof resultCount === 'number' && resultCount === 0) {
    return { status: 'ZERO_RESULTS', resultCount, parsedOutput: parsed };
  }
  return { status: 'SUCCESS', resultCount, parsedOutput: parsed };
}

function deriveResultCount(parsed: any): number | undefined {
  const d = parsed?.data ?? parsed;
  if (Array.isArray(d)) return d.length;
  for (const key of ['items', 'results', 'contacts', 'homeowners', 'permits', 'campaigns', 'templates', 'rules', 'jobs', 'conversations']) {
    const v = d?.[key];
    if (Array.isArray(v)) return v.length;
  }
  return undefined;
}

function truncateJson(value: any): any {
  if (value === undefined || value === null) return value;
  try {
    const serialised = JSON.stringify(value);
    if (serialised.length <= PAYLOAD_TRUNCATION_BYTES) return value;
    return { __truncated: true, size: serialised.length, preview: serialised.slice(0, PAYLOAD_TRUNCATION_BYTES) };
  } catch {
    return { __unserialisable: true };
  }
}
