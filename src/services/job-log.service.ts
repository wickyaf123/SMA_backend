/**
 * Job Logging Service
 * Track execution history of daily automation jobs
 * Day 8: Daily Automation
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as Sentry from '@sentry/node';

export type JobType = 'SHOVELS_SCRAPE' | 'HOMEOWNER_SCRAPE' | 'CONNECTION_RESOLVE' | 'ENRICH' | 'MERGE' | 'VALIDATE' | 'AUTO_ENROLL';
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface JobLogData {
  type: JobType;
  status: JobStatus;
  totalRecords?: number;
  processedRecords?: number;
  successCount?: number;
  errorCount?: number;
  errors?: any;
  metadata?: any;
}

export class JobLogService {
  /**
   * Start a new job log
   */
  async startJob(type: JobType, metadata?: any): Promise<string> {
    const jobLog = await prisma.importJob.create({
      data: {
        type: this.mapJobTypeToImportType(type),
        status: 'PROCESSING',
        startedAt: new Date(),
        metadata: {
          jobType: type,
          ...metadata,
        },
      },
    });

    logger.info({ jobId: jobLog.id, type }, 'Job started');
    return jobLog.id;
  }

  /**
   * Complete a job successfully
   */
  async completeJob(
    jobId: string,
    data: {
      totalRecords: number;
      successCount: number;
      errorCount?: number;
      errors?: any;
      metadata?: any;
    }
  ): Promise<void> {
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalRecords: data.totalRecords,
        processedRecords: data.totalRecords,
        successCount: data.successCount,
        errorCount: data.errorCount || 0,
        errors: data.errors,
      },
    });

    logger.info({ jobId, ...data }, 'Job completed');
  }

  /**
   * Fail a job
   */
  async failJob(jobId: string, error: string, metadata?: any): Promise<void> {
    // Capture job failures in Sentry
    Sentry.captureMessage(`Job failed: ${error}`, {
      level: 'error',
      tags: { jobId },
      extra: metadata,
    });

    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorCount: 1,
        errors: { error, ...metadata },
      },
    });

    logger.error({ jobId, error }, 'Job failed');
  }

  /**
   * Update job progress
   */
  async updateProgress(
    jobId: string,
    data: {
      processedRecords?: number;
      successCount?: number;
      errorCount?: number;
    }
  ): Promise<void> {
    await prisma.importJob.update({
      where: { id: jobId },
      data,
    });
  }

  /**
   * Get recent job history
   */
  async getJobHistory(type?: JobType, limit: number = 50) {
    const where = type
      ? {
          metadata: {
            path: ['jobType'],
            equals: type,
          },
        }
      : {};

    return await prisma.importJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get job statistics
   */
  async getJobStats(type?: JobType, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = type
      ? {
          createdAt: { gte: since },
          metadata: {
            path: ['jobType'],
            equals: type,
          },
        }
      : {
          createdAt: { gte: since },
        };

    const jobs = await prisma.importJob.findMany({
      where,
      select: {
        status: true,
        totalRecords: true,
        successCount: true,
        errorCount: true,
        createdAt: true,
        completedAt: true,
        startedAt: true,
      },
    });

    const completed = jobs.filter((j: any) => j.status === 'COMPLETED').length;
    const failed = jobs.filter((j: any) => j.status === 'FAILED').length;
    const totalRecords = jobs.reduce((sum: number, j: any) => sum + (j.totalRecords || 0), 0);
    const avgDuration =
      jobs
        .filter((j: any) => j.startedAt && j.completedAt)
        .reduce((sum: number, j: any) => {
          const duration = j.completedAt!.getTime() - j.startedAt!.getTime();
          return sum + duration;
        }, 0) / jobs.length;

    return {
      total: jobs.length,
      completed,
      failed,
      pending: jobs.length - completed - failed,
      totalRecords,
      avgDurationMs: Math.round(avgDuration),
    };
  }

  /**
   * Get currently running jobs
   */
  async getRunningJobs() {
    return await prisma.importJob.findMany({
      where: {
        status: 'PROCESSING',
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Map job type to import type (for compatibility with existing schema)
   */
  private mapJobTypeToImportType(jobType: JobType): 'APOLLO' | 'CSV' | 'MANUAL' {
    // Use MANUAL for all automation jobs since they don't fit Apollo/CSV categories
    return 'MANUAL';
  }
}

export const jobLogService = new JobLogService();

