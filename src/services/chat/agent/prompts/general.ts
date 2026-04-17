import { getJerrySystemPrompt } from '../../system-prompt';

/**
 * General-purpose Jerry prompt. Reuses the full canonical Jerry system prompt
 * so all existing UX rules, safety rules, and tool guidance remain intact.
 *
 * Phase 6 of the migration plan splits this into a smaller (~150 line) prompt
 * once the graph is proven stable. For now we preserve the exact Jerry voice
 * to avoid regressions in the feature-flagged rollout.
 */
export function getGeneralPrompt(): string {
  return getJerrySystemPrompt();
}
