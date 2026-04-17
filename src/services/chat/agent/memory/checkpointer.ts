import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { config } from '../../../../config/index';
import { logger } from '../../../../utils/logger';

let checkpointer: PostgresSaver | null = null;
let setupPromise: Promise<PostgresSaver> | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (checkpointer) return checkpointer;
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const url = config.database.url;
    const instance = PostgresSaver.fromConnString(url);
    try {
      await instance.setup();
    } catch (err) {
      logger.error({ err }, 'Failed to set up LangGraph PostgresSaver tables');
      throw err;
    }
    checkpointer = instance;
    logger.info('LangGraph PostgresSaver checkpointer ready');
    return instance;
  })();

  return setupPromise;
}
