import { interrupt } from '@langchain/langgraph';
import { ToolMessage, AIMessage } from '@langchain/core/messages';
import { executeTool } from '../../tools/index';
import { type JerryStateType, type JerryStateUpdate } from '../state';
import { logger } from '../../../../utils/logger';

/**
 * Native LangGraph human-in-the-loop gate for destructive actions.
 *
 * When a node stages a `pendingConfirmation`, this node raises `interrupt()`.
 * The graph run pauses and the runtime returns the pending confirmation to
 * the caller (chat.service). When the user replies with `CONFIRM:<id>:confirm`
 * the graph is resumed with that payload and this node executes the pending
 * tool, replacing the CONFIRMATION_REQUIRED_TOOLS hack from legacy.
 */
export async function confirmNode(state: JerryStateType): Promise<JerryStateUpdate> {
  if (!state.pendingConfirmation) {
    return { pendingConfirmation: null };
  }

  const pending = state.pendingConfirmation;

  const userResponse = interrupt({
    type: 'confirmation',
    actionId: pending.actionId,
    toolName: pending.toolName,
    description: pending.description,
  }) as { decision: 'confirm' | 'cancel' } | string;

  const decision = typeof userResponse === 'string' ? userResponse : userResponse?.decision;

  if (decision !== 'confirm') {
    return {
      pendingConfirmation: null,
      messages: [
        new AIMessage(`Cancelled. ${pending.description} was not executed.`),
      ],
    };
  }

  try {
    const result = await executeTool(pending.toolName, pending.toolInput, {
      conversationId: state.conversationId,
      userId: state.userId ?? undefined,
    });
    return {
      pendingConfirmation: null,
      messages: [
        new ToolMessage({
          content: JSON.stringify(result),
          tool_call_id: pending.actionId,
        }),
      ],
    };
  } catch (err: any) {
    logger.error({ err, tool: pending.toolName }, 'ConfirmNode tool execution failed');
    return {
      pendingConfirmation: null,
      messages: [
        new ToolMessage({
          content: JSON.stringify({ success: false, error: err?.message ?? 'Tool execution failed' }),
          tool_call_id: pending.actionId,
        }),
      ],
    };
  }
}
