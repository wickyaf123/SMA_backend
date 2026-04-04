/**
 * Daily Metrics Service
 * Tracks daily aggregated metrics for unlimited history
 * Provides time-series data for dashboard charts
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface DailyMetricsData {
  date: Date;
  contactsImported: number;
  contactsValidated: number;
  contactsInvalid: number;
  contactsDuplicate: number;
  contactsMerged: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsBounced: number;
  smsSent: number;
  smsDelivered: number;
  smsBounced: number;
  linkedinSent: number;
  linkedinAccepted: number;
  repliesReceived: number;
  repliesEmail: number;
  repliesSms: number;
  repliesLinkedin: number;
  campaignsStarted: number;
  campaignsStopped: number;
  contactsEnrolled: number;
  emailOpenRate: number;
  emailReplyRate: number;
  smsDeliveryRate: number;
  smsReplyRate: number;
  linkedinAcceptRate: number;
  overallReplyRate: number;
}

export class DailyMetricsService {
  /**
   * Increment a metric for today
   */
  async incrementMetric(
    metric: keyof Omit<DailyMetricsData, 'date'>,
    amount: number = 1
  ): Promise<void> {
    const today = this.getTodayDate();

    try {
      await prisma.dailyMetrics.upsert({
        where: { date: today },
        create: {
          date: today,
          [metric]: amount,
        },
        update: {
          [metric]: { increment: amount },
        },
      });

      logger.debug({ date: today, metric, amount }, 'Incremented daily metric');
    } catch (error: any) {
      logger.error(
        { date: today, metric, amount, error: error.message },
        'Failed to increment daily metric'
      );
    }
  }

  /**
   * Set a calculated rate for today
   */
  async setRate(
    rate: 
      | 'emailOpenRate' 
      | 'emailReplyRate' 
      | 'smsDeliveryRate' 
      | 'smsReplyRate'
      | 'linkedinAcceptRate'
      | 'overallReplyRate',
    value: number
  ): Promise<void> {
    const today = this.getTodayDate();

    try {
      await prisma.dailyMetrics.upsert({
        where: { date: today },
        create: {
          date: today,
          [rate]: value,
        },
        update: {
          [rate]: value,
        },
      });

      logger.debug({ date: today, rate, value }, 'Set daily rate');
    } catch (error: any) {
      logger.error(
        { date: today, rate, value, error: error.message },
        'Failed to set daily rate'
      );
    }
  }

  /**
   * Mark job as executed for today
   */
  async markJobExecuted(
    job: 'scrapeJobRan' | 'enrichJobRan' | 'mergeJobRan' | 'validateJobRan' | 'enrollJobRan' | 'apolloJobRan' | 'shovelsJobRan' | 'homeownerJobRan'
  ): Promise<void> {
    const today = this.getTodayDate();

    try {
      await prisma.dailyMetrics.upsert({
        where: { date: today },
        create: {
          date: today,
          [job]: true,
        },
        update: {
          [job]: true,
        },
      });

      logger.debug({ date: today, job }, 'Marked job as executed');
    } catch (error: any) {
      logger.error({ date: today, job, error: error.message }, 'Failed to mark job');
    }
  }

  /**
   * Get metrics for a specific date
   */
  async getMetricsForDate(date: Date, userId?: string): Promise<DailyMetricsData | null> {
    const dateOnly = this.stripTime(date);

    const where: any = { date: dateOnly };
    if (userId) where.userId = userId;

    const metrics = await prisma.dailyMetrics.findFirst({ where });

    if (!metrics) return null;

    return this.formatMetrics(metrics);
  }

  /**
   * Get metrics for date range
   */
  async getMetricsForRange(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<DailyMetricsData[]> {
    const where: any = {
      date: {
        gte: this.stripTime(startDate),
        lte: this.stripTime(endDate),
      },
    };
    if (userId) where.userId = userId;

    const metrics = await prisma.dailyMetrics.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return metrics.map((m) => this.formatMetrics(m));
  }

  /**
   * Get last N days of metrics
   */
  async getLastNDays(days: number, userId?: string): Promise<DailyMetricsData[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.getMetricsForRange(startDate, endDate, userId);
  }

  /**
   * Calculate and store all rates for today based on current counts
   */
  async recalculateRates(): Promise<void> {
    const today = this.getTodayDate();

    const metrics = await prisma.dailyMetrics.findUnique({
      where: { date: today },
    });

    if (!metrics) {
      logger.debug('No metrics for today, skipping rate calculation');
      return;
    }

    // Calculate rates
    const emailOpenRate = metrics.emailsSent > 0
      ? (metrics.emailsOpened / metrics.emailsSent) * 100
      : 0;

    const emailReplyRate = metrics.emailsSent > 0
      ? (metrics.repliesEmail / metrics.emailsSent) * 100
      : 0;

    const smsDeliveryRate = metrics.smsSent > 0
      ? (metrics.smsDelivered / metrics.smsSent) * 100
      : 0;

    const smsReplyRate = metrics.smsSent > 0
      ? (metrics.repliesSms / metrics.smsSent) * 100
      : 0;

    const linkedinAcceptRate = metrics.linkedinSent > 0
      ? (metrics.linkedinAccepted / metrics.linkedinSent) * 100
      : 0;

    const totalSent = metrics.emailsSent + metrics.smsSent + metrics.linkedinSent;
    const overallReplyRate = totalSent > 0
      ? (metrics.repliesReceived / totalSent) * 100
      : 0;

    // Update rates
    await prisma.dailyMetrics.update({
      where: { date: today },
      data: {
        emailOpenRate: Number(emailOpenRate.toFixed(2)),
        emailReplyRate: Number(emailReplyRate.toFixed(2)),
        smsDeliveryRate: Number(smsDeliveryRate.toFixed(2)),
        smsReplyRate: Number(smsReplyRate.toFixed(2)),
        linkedinAcceptRate: Number(linkedinAcceptRate.toFixed(2)),
        overallReplyRate: Number(overallReplyRate.toFixed(2)),
      },
    });

    logger.info({ date: today }, 'Recalculated daily rates');
  }

  /**
   * Get aggregated stats for dashboard
   */
  async getAggregatedStats(days: number = 30, userId?: string): Promise<{
    totalContactsImported: number;
    totalEmailsSent: number;
    totalSmsSent: number;
    totalLinkedinSent: number;
    totalReplies: number;
    avgEmailOpenRate: number;
    avgReplyRate: number;
  }> {
    const metrics = await this.getLastNDays(days, userId);

    const totals = metrics.reduce(
      (acc, m) => ({
        totalContactsImported: acc.totalContactsImported + m.contactsImported,
        totalEmailsSent: acc.totalEmailsSent + m.emailsSent,
        totalSmsSent: acc.totalSmsSent + m.smsSent,
        totalLinkedinSent: acc.totalLinkedinSent + m.linkedinSent,
        totalReplies: acc.totalReplies + m.repliesReceived,
        sumEmailOpenRate: acc.sumEmailOpenRate + m.emailOpenRate,
        sumReplyRate: acc.sumReplyRate + m.overallReplyRate,
      }),
      {
        totalContactsImported: 0,
        totalEmailsSent: 0,
        totalSmsSent: 0,
        totalLinkedinSent: 0,
        totalReplies: 0,
        sumEmailOpenRate: 0,
        sumReplyRate: 0,
      }
    );

    return {
      totalContactsImported: totals.totalContactsImported,
      totalEmailsSent: totals.totalEmailsSent,
      totalSmsSent: totals.totalSmsSent,
      totalLinkedinSent: totals.totalLinkedinSent,
      totalReplies: totals.totalReplies,
      avgEmailOpenRate: metrics.length > 0 ? totals.sumEmailOpenRate / metrics.length : 0,
      avgReplyRate: metrics.length > 0 ? totals.sumReplyRate / metrics.length : 0,
    };
  }

  /**
   * Format metrics for API response
   */
  private formatMetrics(metrics: any): DailyMetricsData {
    return {
      date: metrics.date,
      contactsImported: metrics.contactsImported,
      contactsValidated: metrics.contactsValidated,
      contactsInvalid: metrics.contactsInvalid,
      contactsDuplicate: metrics.contactsDuplicate,
      contactsMerged: metrics.contactsMerged,
      emailsSent: metrics.emailsSent,
      emailsDelivered: metrics.emailsDelivered,
      emailsOpened: metrics.emailsOpened,
      emailsClicked: metrics.emailsClicked,
      emailsBounced: metrics.emailsBounced,
      smsSent: metrics.smsSent,
      smsDelivered: metrics.smsDelivered,
      smsBounced: metrics.smsBounced,
      linkedinSent: metrics.linkedinSent,
      linkedinAccepted: metrics.linkedinAccepted,
      repliesReceived: metrics.repliesReceived,
      repliesEmail: metrics.repliesEmail,
      repliesSms: metrics.repliesSms,
      repliesLinkedin: metrics.repliesLinkedin,
      campaignsStarted: metrics.campaignsStarted,
      campaignsStopped: metrics.campaignsStopped,
      contactsEnrolled: metrics.contactsEnrolled,
      emailOpenRate: metrics.emailOpenRate,
      emailReplyRate: metrics.emailReplyRate,
      smsDeliveryRate: metrics.smsDeliveryRate,
      smsReplyRate: metrics.smsReplyRate,
      linkedinAcceptRate: metrics.linkedinAcceptRate,
      overallReplyRate: metrics.overallReplyRate,
    };
  }

  /**
   * Get today's date as Date object (stripped of time)
   */
  private getTodayDate(): Date {
    return this.stripTime(new Date());
  }

  /**
   * Strip time from date (set to midnight)
   */
  private stripTime(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

// Export singleton
export const dailyMetricsService = new DailyMetricsService();

