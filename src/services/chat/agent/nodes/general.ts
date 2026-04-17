import { SystemMessage, AIMessage } from '@langchain/core/messages';
import { type JerryStateType, type JerryStateUpdate } from '../state';
import { getGeneralPrompt } from '../prompts/general';
import { getAgentModel } from '../model';

export async function generalNode(state: JerryStateType): Promise<JerryStateUpdate> {
  const prompt = getGeneralPrompt();
  const model = getAgentModel();

  const res: AIMessage = await model.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  return {
    messages: [res],
    // General turns don't change flow state; preserve whatever is active.
  };
}
