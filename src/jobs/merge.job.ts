/**
 * Merge Job
 * Daily data merging and deduplication with automatic merging
 * Uses completeness scoring to determine winner
 */

import { contactAutoMerger } from '../services/merger/contact-auto-merger.service';
import { logger } from '../utils/logger';

export interface MergeJobConfig {
  dryRun?: boolean;
}

export interface MergeJobResult {
  success: boolean;
  duplicatesFound: number;
  duplicatesMerged: number;
  errors: string[];
  duration: number;
}

export class MergeJob {
  async run(config: MergeJobConfig = { dryRun: false }): Promise<MergeJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting merge job with automatic merging');

    try {
      // Find and merge duplicates from the last 24 hours
      const result = await contactAutoMerger.findAndMergeDuplicates({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(),
        dryRun: config.dryRun,
      });

      const duration = Date.now() - startTime;

      logger.info(
        {
          duplicatesFound: result.duplicatesFound,
          duplicatesMerged: result.duplicatesMerged,
          errors: result.errors.length,
          duration,
        },
        'Merge job completed'
      );

      return {
        success: result.errors.length === 0,
        duplicatesFound: result.duplicatesFound,
        duplicatesMerged: result.duplicatesMerged,
        errors: result.errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Merge job failed');

      return {
        success: false,
        duplicatesFound: 0,
        duplicatesMerged: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const mergeJob = new MergeJob();
