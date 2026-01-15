import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { ImportJobType, ImportJobStatus } from '@prisma/client';

/**
 * Import job progress update
 */
export interface ImportJobProgress {
  processedRecords: number;
  successCount: number;
  duplicateCount: number;
  invalidCount: number;
  errorCount: number;
  errors?: Array<{
    row: number;
    email: string;
    error: string;
  }>;
}

/**
 * Import Job Service
 * Manages import job tracking and progress updates
 */
export class ImportJobService {
  /**
   * Create a new import job
   */
  public async createJob(
    type: ImportJobType,
    totalRecords: number,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const job = await prisma.importJob.create({
        data: {
          type,
          status: ImportJobStatus.PENDING,
          totalRecords,
          metadata: metadata || {},
        },
      });

      logger.info({
        jobId: job.id,
        type,
        totalRecords,
      }, 'Import job created');

      return job.id;
    } catch (error) {
      logger.error({
        type,
        totalRecords,
        error,
      }, 'Failed to create import job');
      throw error;
    }
  }

  /**
   * Start processing a job
   */
  public async startJob(jobId: string): Promise<void> {
    try {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      logger.info({ jobId }, 'Import job started');
    } catch (error) {
      logger.error({
        jobId,
        error,
      }, 'Failed to start import job');
      throw error;
    }
  }

  /**
   * Update job progress
   */
  public async updateProgress(
    jobId: string,
    progress: Partial<ImportJobProgress>
  ): Promise<void> {
    try {
      const updateData: any = {};

      if (progress.processedRecords !== undefined) {
        updateData.processedRecords = progress.processedRecords;
      }
      if (progress.successCount !== undefined) {
        updateData.successCount = progress.successCount;
      }
      if (progress.duplicateCount !== undefined) {
        updateData.duplicateCount = progress.duplicateCount;
      }
      if (progress.invalidCount !== undefined) {
        updateData.invalidCount = progress.invalidCount;
      }
      if (progress.errorCount !== undefined) {
        updateData.errorCount = progress.errorCount;
      }
      if (progress.errors !== undefined) {
        updateData.errors = progress.errors;
      }

      await prisma.importJob.update({
        where: { id: jobId },
        data: updateData,
      });

      logger.debug({
        jobId,
        progress,
      }, 'Import job progress updated');
    } catch (error) {
      logger.error({
        jobId,
        progress,
        error,
      }, 'Failed to update import job progress');
      throw error;
    }
  }

  /**
   * Complete a job successfully
   */
  public async completeJob(jobId: string): Promise<void> {
    try {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      logger.info({ jobId }, 'Import job completed');
    } catch (error) {
      logger.error({
        jobId,
        error,
      }, 'Failed to complete import job');
      throw error;
    }
  }

  /**
   * Mark a job as failed
   */
  public async failJob(jobId: string, errorMessage: string): Promise<void> {
    try {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.FAILED,
          completedAt: new Date(),
          errors: {
            message: errorMessage,
            failedAt: new Date().toISOString(),
          },
        },
      });

      logger.error({
        jobId,
        errorMessage,
      }, 'Import job failed');
    } catch (error) {
      logger.error({
        jobId,
        errorMessage,
        error,
      }, 'Failed to mark import job as failed');
      throw error;
    }
  }

  /**
   * Get job status
   */
  public async getJobStatus(jobId: string): Promise<any> {
    try {
      const job = await prisma.importJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new Error(`Import job ${jobId} not found`);
      }

      const percentComplete = job.totalRecords > 0
        ? Math.round((job.processedRecords / job.totalRecords) * 100)
        : 0;

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        totalRecords: job.totalRecords,
        processedRecords: job.processedRecords,
        successCount: job.successCount,
        duplicateCount: job.duplicateCount,
        invalidCount: job.invalidCount,
        errorCount: job.errorCount,
        percentComplete,
        errors: job.errors,
        metadata: job.metadata,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      };
    } catch (error) {
      logger.error({
        jobId,
        error,
      }, 'Failed to get import job status');
      throw error;
    }
  }

  /**
   * Get recent jobs
   */
  public async getRecentJobs(limit: number = 10): Promise<any[]> {
    try {
      const jobs = await prisma.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        totalRecords: job.totalRecords,
        successCount: job.successCount,
        duplicateCount: job.duplicateCount,
        invalidCount: job.invalidCount,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      }));
    } catch (error) {
      logger.error({
        error,
      }, 'Failed to get recent import jobs');
      throw error;
    }
  }
}

// Export singleton instance
export const importJobService = new ImportJobService();

