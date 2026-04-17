import { ChatAnthropic } from '@langchain/anthropic';
import { config } from '../../../config/index';
import { getLangGraphTools } from './tools-adapter';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

let cached: { bound: any; plain: ChatAnthropic } | null = null;

/**
 * ChatAnthropic model with tools bound for agent nodes.
 * Cached to avoid re-binding the tool list on every turn.
 */
export function getAgentModel() {
  if (!cached) {
    const plain = new ChatAnthropic({
      apiKey: config.anthropic.apiKey,
      model: MODEL,
      maxTokens: MAX_TOKENS,
      streaming: true,
    });
    const bound = plain.bindTools(getLangGraphTools());
    cached = { bound, plain };
  }
  return cached.bound;
}

/**
 * Plain (no tools bound) model for router classification and text-only
 * follow-ups after a confirmation-required tool call.
 */
export function getPlainModel(): ChatAnthropic {
  if (!cached) getAgentModel();
  return cached!.plain;
}

/**
 * Lightweight haiku model for the router classifier. Cheaper and faster.
 */
let routerModel: ChatAnthropic | null = null;
export function getRouterModel(): ChatAnthropic {
  if (!routerModel) {
    routerModel = new ChatAnthropic({
      apiKey: config.anthropic.apiKey,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 16,
      streaming: false,
    });
  }
  return routerModel;
}
