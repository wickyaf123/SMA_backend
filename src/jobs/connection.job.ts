import { connectionService } from '../services/connection/connection.service';
import { logger } from '../utils/logger';

export interface ConnectionJobConfig {
  batchSize?: number;
}

export interface ConnectionJobResult {
  success: boolean;
  total: number;
  connected: number;
  noContractor: number;
  errors: string[];
  duration: number;
}

export class ConnectionJob {
  async run(config: ConnectionJobConfig = { batchSize: 50 }): Promise<ConnectionJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting connection resolver job');

    try {
      const result = await connectionService.resolveConnections(config.batchSize || 50);
      const duration = Date.now() - startTime;

      logger.info({ ...result, duration }, 'Connection resolver job completed');

      return {
        success: result.success,
        total: result.total,
        connected: result.connected,
        noContractor: result.noContractor,
        errors: result.errors > 0 ? [`${result.errors} homeowners failed to resolve`] : [],
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Connection resolver job failed');

      return {
        success: false,
        total: 0,
        connected: 0,
        noContractor: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const connectionJob = new ConnectionJob();
