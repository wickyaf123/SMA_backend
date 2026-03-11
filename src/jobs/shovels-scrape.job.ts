import { shovelsScraperService } from '../services/scraper/shovels.service';
import { logger } from '../utils/logger';

export interface ShovelsJobConfig {
  useSettings?: boolean;
}

export const shovelsScraperJob = {
  async run(options: ShovelsJobConfig = {}): Promise<any> {
    logger.info({ options }, 'Starting Shovels scraper job');
    const startTime = Date.now();
    const result = await shovelsScraperService.runFromSettings();
    const duration = Date.now() - startTime;
    logger.info({ ...result, duration }, 'Shovels scraper job complete');
    return { ...result, duration };
  },
};
