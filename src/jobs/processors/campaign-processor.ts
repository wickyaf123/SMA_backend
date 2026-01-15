/**
 * Campaign Job Processor
 * Handles campaign enrollment and outreach jobs
 */

import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { campaignService } from '../../services/campaign/campaign.service';
import { emailOutreachService } from '../../services/outreach/email.service';
import { settingsService } from '../../services/settings/settings.service';
import { realtimeEmitter } from '../../services/realtime/event-emitter.service';
import { dailyMetricsService } from '../../services/metrics/daily-metrics.service';
import { logger } from '../../utils/logger';
import type { CampaignJobData } from '../queues';

export async function processCampaignJob(job: Job<CampaignJobData>): Promise<any> {
  const { type, campaignId, contactIds, batchSize = 50 } = job.data;

  logger.info({ jobId: job.id, type, campaignId, contactIds }, 'Processing campaign job');

  // Emit job started
  realtimeEmitter.emitJobEvent({
    jobId: job.id!,
    jobType: `campaign:${type}`,
    status: 'started',
  });

  const startTime = Date.now();

  try {
    let result: any;

    switch (type) {
      case 'enroll':
        result = await processAutoEnroll(job, batchSize);
        break;

      case 'send-email':
        result = await processSendEmail(job, campaignId!, contactIds!);
        break;

      case 'sync-status':
        result = await processSyncStatus(job, campaignId!);
        break;

      default:
        throw new Error(`Unknown campaign job type: ${type}`);
    }

    const duration = Date.now() - startTime;

    // Mark job as ran in daily metrics
    if (type === 'enroll') {
      await dailyMetricsService.markJobExecuted('enrollJobRan');
    }

    // Emit job completed
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: `campaign:${type}`,
      status: 'completed',
      result: { ...result, duration },
      duration,
    });

    return { ...result, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Emit job failed
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: `campaign:${type}`,
      status: 'failed',
      error: error.message,
      duration,
    });

    throw error;
  }
}

/**
 * Auto-enroll validated contacts into default campaigns
 */
async function processAutoEnroll(job: Job, batchSize: number): Promise<any> {
  // Check if enroll job is enabled
  const isEnabled = await settingsService.isJobEnabled('enroll');
  if (!isEnabled) {
    return {
      success: true,
      skipped: true,
      reason: 'Job disabled in settings',
    };
  }

  // Get default campaign IDs
  const settings = await settingsService.getSettings();

  if (!settings.defaultEmailCampaignId && !settings.defaultSmsCampaignId) {
    return {
      success: true,
      skipped: true,
      reason: 'No default campaigns configured',
    };
  }

  // Get validated contacts that aren't enrolled yet
  const contacts = await prisma.contact.findMany({
    where: {
      status: 'VALIDATED',
      campaignEnrollments: { none: {} },
    },
    take: batchSize,
    orderBy: { createdAt: 'desc' },
  });

  logger.info({ count: contacts.length }, 'Found contacts to enroll');

  let emailEnrollments = 0;
  let smsEnrollments = 0;
  const errors: string[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    // Emit progress
    if (i % 10 === 0) {
      await job.updateProgress((i / contacts.length) * 100);
      realtimeEmitter.emitJobEvent({
        jobId: job.id!,
        jobType: 'campaign:enroll',
        status: 'progress',
        progress: {
          current: i,
          total: contacts.length,
          percentage: Math.round((i / contacts.length) * 100),
        },
      });
    }

    let enrolledInAny = false;

    // Enroll in Email campaign
    if (settings.defaultEmailCampaignId && contact.email) {
      try {
        const emailEnabled = await settingsService.isOutreachEnabled('email');
        if (emailEnabled) {
          await campaignService.enrollContacts(settings.defaultEmailCampaignId, [contact.id]);
          await emailOutreachService.enrollInInstantly(
            settings.defaultEmailCampaignId,
            [contact.id],
            { skipIfInWorkspace: true, skipIfInCampaign: true }
          );
          emailEnrollments++;
          enrolledInAny = true;

          realtimeEmitter.emitContactEnrolled({
            contactId: contact.id,
            email: contact.email,
            fullName: contact.fullName || undefined,
            action: 'enrolled_email',
          });
        }
      } catch (e: any) {
        errors.push(`Email enrollment for ${contact.id}: ${e.message}`);
      }
    }

    // Enroll in SMS campaign
    if (settings.defaultSmsCampaignId && contact.phone) {
      try {
        const smsEnabled = await settingsService.isOutreachEnabled('sms');
        if (smsEnabled) {
          await campaignService.enrollContacts(settings.defaultSmsCampaignId, [contact.id]);
          smsEnrollments++;
          enrolledInAny = true;

          realtimeEmitter.emitContactEnrolled({
            contactId: contact.id,
            fullName: contact.fullName || undefined,
            action: 'enrolled_sms',
          });
        }
      } catch (e: any) {
        errors.push(`SMS enrollment for ${contact.id}: ${e.message}`);
      }
    }

    // Update contact status
    if (enrolledInAny) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { status: 'IN_SEQUENCE' },
      });
    }
  }

  // Update metrics
  await dailyMetricsService.incrementMetric('contactsEnrolled', emailEnrollments + smsEnrollments);

  // Emit campaign enrollment event
  realtimeEmitter.emitCampaignEnrollment({
    campaignId: settings.defaultEmailCampaignId || settings.defaultSmsCampaignId || 'default',
    action: 'batch_enrollment',
    enrollmentCount: emailEnrollments + smsEnrollments,
    details: { emailEnrollments, smsEnrollments },
  });

  await job.updateProgress(100);

  return {
    success: true,
    contactsProcessed: contacts.length,
    emailEnrollments,
    smsEnrollments,
    errors: errors.slice(0, 10),
  };
}

/**
 * Send emails to contacts via Instantly
 */
async function processSendEmail(
  job: Job,
  campaignId: string,
  contactIds: string[]
): Promise<any> {
  const result = await emailOutreachService.enrollInInstantly(
    campaignId,
    contactIds,
    { skipIfInWorkspace: false, skipIfInCampaign: false }
  );

  // Update metrics
  if (result.success > 0) {
    await dailyMetricsService.incrementMetric('emailsSent', result.success);
  }

  return {
    success: true,
    sent: result.success,
    failed: result.failed,
    skipped: result.skipped,
  };
}

/**
 * Sync campaign status from Instantly
 */
async function processSyncStatus(job: Job, campaignId: string): Promise<any> {
  await emailOutreachService.syncCampaignStatus(campaignId);

  return {
    success: true,
    campaignId,
    synced: true,
  };
}



