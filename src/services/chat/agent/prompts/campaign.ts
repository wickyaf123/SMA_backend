import { getJerrySystemPrompt } from '../../system-prompt';
import type { SearchContext, CampaignContext } from '../state';

/**
 * Campaign-build prompt. Wraps the base Jerry prompt with a preamble that
 * injects persisted searchContext + campaignContext so the Q8-Q11 flow
 * (offer angle, sequence intensity, SMS timing, enrollment confirmation)
 * never loses track of where the user is.
 */
export function getCampaignPrompt(
  searchContext: SearchContext | null,
  campaignContext: CampaignContext | null,
): string {
  const searchBlock = searchContext && Object.keys(searchContext).length > 0
    ? `\n## Prior Search Context (from persisted state)\n${formatRecord(searchContext)}\n`
    : '';

  const campaignBlock = campaignContext && Object.keys(campaignContext).length > 0
    ? `\n## Campaign Build Progress (already answered)\n${formatRecord(campaignContext)}\n\nDO NOT re-ask for any of these. Advance to the next unanswered question.\n`
    : '';

  const stepGuide = nextStepHint(campaignContext);

  const preamble = `## CURRENT FLOW: CAMPAIGN BUILD (Q8-Q11)\nYou are guiding the user through the post-search campaign setup flow. The flow is:\n- Q8: Offer angle (jerry:buttons, trade-specific options from Trade Intelligence)\n- Q9: Sequence intensity (light / standard / aggressive)\n- Q10: SMS timing (morning / afternoon / evening) — only if channels include SMS\n- Q11: Confirmation (jerry:confirm with full enrollment summary, then enroll_contacts)\n\n${stepGuide}${searchBlock}${campaignBlock}`;

  return `${preamble}\n\n${getJerrySystemPrompt()}`;
}

function formatRecord(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? JSON.stringify(v) : String(v)}`)
    .join('\n');
}

function nextStepHint(cc: CampaignContext | null): string {
  if (!cc || !cc.offerAngle) return 'Next step: Q8 offer angle.';
  if (!cc.sequenceIntensity) return 'Next step: Q9 sequence intensity.';
  if (!cc.smsTiming) return 'Next step: Q10 SMS timing (skip if SMS not selected) — otherwise Q11 confirmation.';
  if (!cc.campaignId) return 'Next step: Q11 confirmation card, then enroll_contacts.';
  return 'Campaign already enrolled — confirm outcome and return to general Jerry.';
}
