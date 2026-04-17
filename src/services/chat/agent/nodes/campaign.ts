import { SystemMessage, AIMessage } from '@langchain/core/messages';
import { type JerryStateType, type JerryStateUpdate, type CampaignContext } from '../state';
import { getCampaignPrompt } from '../prompts/campaign';
import { getAgentModel } from '../model';

/**
 * Handles the Q8-Q11 campaign-build flow after a search completes.
 * Reads searchContext (trade/city/channels), writes campaignContext
 * (offerAngle, sequenceIntensity, smsTiming, campaignId) as the user answers.
 */
export async function campaignNode(state: JerryStateType): Promise<JerryStateUpdate> {
  const prompt = getCampaignPrompt(state.searchContext ?? null, state.campaignContext ?? null);
  const model = getAgentModel();

  const res: AIMessage = await model.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  const update: JerryStateUpdate = {
    messages: [res],
    activeFlow: 'campaign_build',
  };

  // Capture BUTTON-response patterns from the most recent user message so
  // campaignContext fills in as the user progresses through Q8-Q11.
  const lastUser = [...state.messages].reverse().find((m: any) => m._getType?.() === 'human');
  const userContent = typeof lastUser?.content === 'string' ? lastUser.content : '';
  const patch: CampaignContext = {};
  if (/^BUTTON:(ct|ho)-offer-angle:/.test(userContent)) {
    patch.offerAngle = userContent.split(':').slice(2).join(':');
  } else if (/^BUTTON:(ct|ho)-sequence:/.test(userContent)) {
    patch.sequenceIntensity = userContent.split(':').slice(2).join(':');
  } else if (/^BUTTON:(ct|ho)-sms-timing:/.test(userContent)) {
    patch.smsTiming = userContent.split(':').slice(2).join(':');
  }

  // If the model just called enroll_contacts, capture the campaignId from its args.
  const toolCalls = (res as any).tool_calls as Array<{ name: string; args: any }> | undefined;
  if (toolCalls?.length) {
    for (const tc of toolCalls) {
      if (tc.name === 'enroll_contacts' && tc.args?.campaignId) {
        patch.campaignId = String(tc.args.campaignId);
      }
    }
  }

  if (Object.keys(patch).length) update.campaignContext = patch;
  return update;
}
