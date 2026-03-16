import { homeownerScraperService } from '../services/scraper/homeowner.service';
import { logger } from '../utils/logger';

export const homeownerScraperJob = {
  async run(options: { useSettings?: boolean } = {}): Promise<any> {
    const startTime = Date.now();
    logger.info('Homeowner scraper job starting');

    const result = await homeownerScraperService.runFromSettings();
    const duration = Date.now() - startTime;

    logger.info({ ...result, duration }, 'Homeowner scraper job completed');
    return { ...result, duration };
  },
};
