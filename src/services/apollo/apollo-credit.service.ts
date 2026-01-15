/**
 * Apollo Credit Service
 * Tracks monthly Apollo credit usage and enforces 2,000 credit limit
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface ApolloCreditUsage {
  month: string;
  creditsUsed: number;
  creditsLimit: number;
  searchCredits: number;
  enrichCredits: number;
  mobileCredits: number;
  jobExecutions: number;
  percentUsed: number;
  canRunJob: boolean;
}

export class ApolloCreditService {
  private readonly MONTHLY_LIMIT = 2000;
  private readonly WARNING_THRESHOLD = 0.8; // 80%

  /**
   * Get current month's credit usage
   */
  async getCurrentUsage(): Promise<ApolloCreditUsage> {
    const currentMonth = this.getCurrentMonth();

    let usage = await prisma.apolloCreditUsage.findUnique({
      where: { month: currentMonth },
    });

    // Create if doesn't exist
    if (!usage) {
      usage = await prisma.apolloCreditUsage.create({
        data: {
          month: currentMonth,
          creditsLimit: this.MONTHLY_LIMIT,
        },
      });
      logger.info({ month: currentMonth }, 'Created new Apollo credit tracking record');
    }

    const percentUsed = (usage.creditsUsed / usage.creditsLimit) * 100;
    const canRunJob = usage.creditsUsed < usage.creditsLimit;

    return {
      month: usage.month,
      creditsUsed: usage.creditsUsed,
      creditsLimit: usage.creditsLimit,
      searchCredits: usage.searchCredits,
      enrichCredits: usage.enrichCredits,
      mobileCredits: usage.mobileCredits,
      jobExecutions: usage.jobExecutions,
      percentUsed,
      canRunJob,
    };
  }

  /**
   * Check if we can run Apollo job (under monthly limit)
   */
  async canRunJob(): Promise<boolean> {
    const usage = await this.getCurrentUsage();
    return usage.canRunJob;
  }

  /**
   * Record credit usage after job execution
   */
  async recordUsage(
    creditsUsed: number,
    breakdown?: {
      search?: number;
      enrich?: number;
      mobile?: number;
    }
  ): Promise<void> {
    const currentMonth = this.getCurrentMonth();

    const usage = await prisma.apolloCreditUsage.upsert({
      where: { month: currentMonth },
      create: {
        month: currentMonth,
        creditsUsed,
        creditsLimit: this.MONTHLY_LIMIT,
        searchCredits: breakdown?.search || 0,
        enrichCredits: breakdown?.enrich || creditsUsed,
        mobileCredits: breakdown?.mobile || 0,
        jobExecutions: 1,
        lastJobAt: new Date(),
      },
      update: {
        creditsUsed: { increment: creditsUsed },
        searchCredits: breakdown?.search ? { increment: breakdown.search } : undefined,
        enrichCredits: breakdown?.enrich 
          ? { increment: breakdown.enrich } 
          : { increment: creditsUsed },
        mobileCredits: breakdown?.mobile ? { increment: breakdown.mobile } : undefined,
        jobExecutions: { increment: 1 },
        lastJobAt: new Date(),
      },
    });

    logger.info(
      {
        month: currentMonth,
        creditsUsed,
        totalCredits: usage.creditsUsed + creditsUsed,
        limit: this.MONTHLY_LIMIT,
      },
      'Recorded Apollo credit usage'
    );

    // Check for warnings
    await this.checkUsageThresholds(usage.creditsUsed + creditsUsed);
  }

  /**
   * Check if usage has crossed warning thresholds
   */
  private async checkUsageThresholds(totalCredits: number): Promise<void> {
    const currentMonth = this.getCurrentMonth();
    const percentUsed = totalCredits / this.MONTHLY_LIMIT;

    // 80% warning
    if (percentUsed >= this.WARNING_THRESHOLD) {
      const usage = await prisma.apolloCreditUsage.findUnique({
        where: { month: currentMonth },
      });

      if (usage && !usage.limitWarningAt) {
        await prisma.apolloCreditUsage.update({
          where: { month: currentMonth },
          data: { limitWarningAt: new Date() },
        });

        logger.warn(
          {
            creditsUsed: totalCredits,
            creditsLimit: this.MONTHLY_LIMIT,
            percentUsed: (percentUsed * 100).toFixed(1),
          },
          'Apollo credit usage warning: 80% threshold reached'
        );
      }
    }

    // 100% limit reached
    if (percentUsed >= 1.0) {
      const usage = await prisma.apolloCreditUsage.findUnique({
        where: { month: currentMonth },
      });

      if (usage && !usage.limitReachedAt) {
        await prisma.apolloCreditUsage.update({
          where: { month: currentMonth },
          data: { limitReachedAt: new Date() },
        });

        logger.error(
          {
            creditsUsed: totalCredits,
            creditsLimit: this.MONTHLY_LIMIT,
          },
          'Apollo credit limit reached: future jobs will be skipped'
        );
      }
    }
  }

  /**
   * Get usage statistics for dashboard
   */
  async getUsageStats(months: number = 6): Promise<ApolloCreditUsage[]> {
    const monthStrings = this.getLastNMonths(months);

    const usageRecords = await prisma.apolloCreditUsage.findMany({
      where: {
        month: { in: monthStrings },
      },
      orderBy: { month: 'desc' },
    });

    return usageRecords.map((usage) => ({
      month: usage.month,
      creditsUsed: usage.creditsUsed,
      creditsLimit: usage.creditsLimit,
      searchCredits: usage.searchCredits,
      enrichCredits: usage.enrichCredits,
      mobileCredits: usage.mobileCredits,
      jobExecutions: usage.jobExecutions,
      percentUsed: (usage.creditsUsed / usage.creditsLimit) * 100,
      canRunJob: usage.creditsUsed < usage.creditsLimit,
    }));
  }

  /**
   * Reset monthly usage (for testing or manual override)
   */
  async resetMonth(month?: string): Promise<void> {
    const targetMonth = month || this.getCurrentMonth();

    await prisma.apolloCreditUsage.update({
      where: { month: targetMonth },
      data: {
        creditsUsed: 0,
        searchCredits: 0,
        enrichCredits: 0,
        mobileCredits: 0,
        jobExecutions: 0,
        limitWarningAt: null,
        limitReachedAt: null,
        lastJobAt: null,
      },
    });

    logger.warn({ month: targetMonth }, 'Apollo credit usage reset');
  }

  /**
   * Get current month string (YYYY-MM format)
   */
  private getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Get last N months as array of strings
   */
  private getLastNMonths(n: number): string[] {
    const months: string[] = [];
    const now = new Date();

    for (let i = 0; i < n; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    return months;
  }
}

// Export singleton
export const apolloCreditService = new ApolloCreditService();

