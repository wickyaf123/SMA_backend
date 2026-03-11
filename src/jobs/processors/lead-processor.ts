/**
 * Lead Processing Job Processor
 * Handles validation, enrichment, and deduplication of contacts in real-time
 */

import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { emailValidationService } from '../../services/validation/email.service';
import { phoneValidationService } from '../../services/validation/phone.service';
import { ClayEnrichmentService } from '../../services/enrichment/clay.service';

const clayService = new ClayEnrichmentService();
import { deduplicationService } from '../../services/lead/deduplication.service';
import { contactAutoMerger } from '../../services/merger/contact-auto-merger.service';
import { realtimeEmitter } from '../../services/realtime/event-emitter.service';
import { logger } from '../../utils/logger';
import type { LeadProcessingJobData } from '../queues';

export async function processLeadJob(job: Job<LeadProcessingJobData>): Promise<any> {
  const { type, contactId, contactIds, batchSize = 50, options } = job.data;

  logger.info({ jobId: job.id, type, contactId, contactIds }, 'Processing lead job');

  // Emit job started
  realtimeEmitter.emitJobEvent({
    jobId: job.id!,
    jobType: `lead-processing:${type}`,
    status: 'started',
  });

  try {
    let result: any;

    switch (type) {
      case 'validate':
        result = await processValidation(job, contactId, contactIds, options);
        break;

      case 'enrich':
        result = await processEnrichment(job, contactId, contactIds);
        break;

      case 'deduplicate':
        result = await processDeduplication(job, batchSize);
        break;

      case 'full-pipeline':
        result = await processFullPipeline(job, contactId, options);
        break;

      default:
        throw new Error(`Unknown lead processing type: ${type}`);
    }

    // Emit job completed
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: `lead-processing:${type}`,
      status: 'completed',
      result,
    });

    return result;
  } catch (error: any) {
    // Emit job failed
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: `lead-processing:${type}`,
      status: 'failed',
      error: error.message,
    });

    throw error;
  }
}

/**
 * Validate a contact's email and/or phone
 */
async function processValidation(
  job: Job,
  contactId?: string,
  contactIds?: string[],
  options?: { validateEmail?: boolean; validatePhone?: boolean }
): Promise<any> {
  const ids = contactIds || (contactId ? [contactId] : []);
  
  if (ids.length === 0) {
    // Get contacts that need validation
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { emailValidationStatus: 'PENDING' },
          { phoneValidationStatus: 'PENDING' },
        ],
      },
      take: 50,
      select: { id: true, email: true, phone: true },
    });
    ids.push(...contacts.map(c => c.id));
  }

  let emailValidated = 0;
  let phoneValidated = 0;
  const errors: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    
    try {
      const contact = await prisma.contact.findUnique({
        where: { id },
        select: { id: true, email: true, phone: true, fullName: true },
      });

      if (!contact) continue;

      // Emit progress
      if (i % 10 === 0) {
        await job.updateProgress((i / ids.length) * 100);
        realtimeEmitter.emitJobEvent({
          jobId: job.id!,
          jobType: 'lead-processing:validate',
          status: 'progress',
          progress: {
            current: i,
            total: ids.length,
            percentage: Math.round((i / ids.length) * 100),
          },
        });
      }

      // Validate email
      if (options?.validateEmail !== false && contact.email) {
        try {
          await emailValidationService.validateContactEmail(id);
          emailValidated++;
          
          realtimeEmitter.emitContactValidated({
            contactId: id,
            email: contact.email,
            fullName: contact.fullName || undefined,
            action: 'email_validated',
          });
        } catch (e: any) {
          errors.push(`Email validation failed for ${id}: ${e.message}`);
        }
      }

      // Validate phone
      if (options?.validatePhone !== false && contact.phone) {
        try {
          await phoneValidationService.validateContactPhone(id);
          phoneValidated++;
          
          realtimeEmitter.emitContactValidated({
            contactId: id,
            fullName: contact.fullName || undefined,
            action: 'phone_validated',
          });
        } catch (e: any) {
          errors.push(`Phone validation failed for ${id}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`Contact ${id}: ${e.message}`);
    }
  }

  return {
    success: true,
    totalProcessed: ids.length,
    emailValidated,
    phoneValidated,
    errors: errors.slice(0, 10),
  };
}

/**
 * Enrich contacts with Hunter.io
 */
async function processEnrichment(
  job: Job,
  contactId?: string,
  contactIds?: string[]
): Promise<any> {
  const ids = contactIds || (contactId ? [contactId] : []);

  if (ids.length === 0) {
    // Get contacts that need enrichment
    const contacts = await prisma.contact.findMany({
      where: {
        clayEnrichedAt: null,
        emailValidationStatus: 'VALID',
      },
      take: 50,
      select: { id: true },
    });
    ids.push(...contacts.map(c => c.id));
  }

  let enriched = 0;
  const errors: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    try {
      const contact = await prisma.contact.findUnique({
        where: { id },
        select: { id: true, email: true, fullName: true },
      });

      if (!contact?.email) continue;

      // Emit progress
      if (i % 5 === 0) {
        await job.updateProgress((i / ids.length) * 100);
        realtimeEmitter.emitJobEvent({
          jobId: job.id!,
          jobType: 'lead-processing:enrich',
          status: 'progress',
          progress: {
            current: i,
            total: ids.length,
            percentage: Math.round((i / ids.length) * 100),
          },
        });
      }

      // Enrich with Hunter
      const result = await clayService.enrichContact(id);
      
      if (result.success) {
        enriched++;
        realtimeEmitter.emitContactEnriched({
          contactId: id,
          email: result.email,
          fullName: contact.fullName || undefined,
          action: 'clay_enriched',
          details: {},
        });
      }
    } catch (e: any) {
      errors.push(`Contact ${id}: ${e.message}`);
    }
  }

  return {
    success: true,
    totalProcessed: ids.length,
    enriched,
    errors: errors.slice(0, 10),
  };
}

/**
 * Run deduplication on contacts
 */
async function processDeduplication(job: Job, batchSize: number): Promise<any> {
  // Find and merge duplicates from the last 24 hours
  const result = await contactAutoMerger.findAndMergeDuplicates({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: new Date(),
    dryRun: false,
  });

  // Emit progress
  await job.updateProgress(100);

  return {
    success: result.errors.length === 0,
    duplicatesFound: result.duplicatesFound,
    merged: result.duplicatesMerged,
    errors: result.errors,
  };
}

/**
 * Process full pipeline for a single contact (validate -> enrich -> dedupe)
 */
async function processFullPipeline(
  job: Job,
  contactId?: string,
  options?: any
): Promise<any> {
  if (!contactId) {
    throw new Error('contactId required for full-pipeline');
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, phone: true, fullName: true },
  });

  if (!contact) {
    throw new Error(`Contact ${contactId} not found`);
  }

  const results = {
    validated: false,
    enriched: false,
    deduped: false,
    emailStatus: 'PENDING' as string,
    phoneStatus: 'PENDING' as string,
  };

  // Step 1: Validate Email
  await job.updateProgress(10);
  if (contact.email) {
    try {
      const emailStatus = await emailValidationService.validateContactEmail(contactId);
      results.validated = true;
      results.emailStatus = emailStatus;
      realtimeEmitter.emitContactValidated({
        contactId,
        email: contact.email,
        fullName: contact.fullName || undefined,
        action: 'email_validated',
      });
    } catch (e) {
      logger.warn({ contactId, error: e }, 'Email validation failed in pipeline');
    }
  }

  // Step 2: Validate Phone
  await job.updateProgress(40);
  if (contact.phone) {
    try {
      const phoneStatus = await phoneValidationService.validateContactPhone(contactId);
      results.validated = true;
      results.phoneStatus = phoneStatus;
      realtimeEmitter.emitContactValidated({
        contactId,
        fullName: contact.fullName || undefined,
        action: 'phone_validated',
      });
    } catch (e) {
      logger.warn({ contactId, error: e }, 'Phone validation failed in pipeline');
    }
  }

  // Step 3: Update contact status based on validation results
  await job.updateProgress(50);
  const updatedContact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { emailValidationStatus: true, phoneValidationStatus: true },
  });

  // Set contact status to VALIDATED if email is valid
  if (updatedContact?.emailValidationStatus === 'VALID') {
    await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'VALIDATED' },
    });
    logger.info({ contactId }, 'Contact status updated to VALIDATED');
  }

  // Step 4: Enrich (only if email is valid)
  await job.updateProgress(60);
  if (updatedContact?.emailValidationStatus === 'VALID') {
    try {
      const enrichResult = await clayService.enrichContact(contactId);
      results.enriched = enrichResult.success;
      if (results.enriched) {
        realtimeEmitter.emitContactEnriched({
          contactId,
          email: enrichResult.email || contact.email || undefined,
          fullName: contact.fullName || undefined,
          action: 'clay_enriched',
        });
      }
    } catch (e) {
      logger.warn({ contactId, error: e }, 'Enrichment failed in pipeline');
    }
  }

  // Step 5: Check for duplicates (skip if already checked during creation)
  await job.updateProgress(90);
  if (options?.checkDuplicates !== false && contact.email) {
    try {
      const dupCheck = await deduplicationService.checkDuplicate(contact.email);
      results.deduped = dupCheck.isDuplicate;
    } catch (e) {
      logger.warn({ contactId, error: e }, 'Dedup check failed in pipeline');
    }
  }

  // Step 6: Create activity log for validation completion
  await prisma.activityLog.create({
    data: {
      contactId,
      action: 'VALIDATION_COMPLETED',
      description: `Validation complete: Email ${results.emailStatus}, Phone ${results.phoneStatus}`,
      actorType: 'SYSTEM',
      metadata: {
        emailStatus: results.emailStatus,
        phoneStatus: results.phoneStatus,
        enriched: results.enriched,
      },
    },
  });

  await job.updateProgress(100);

  logger.info({
    contactId,
    results,
  }, 'Full pipeline completed for contact');

  return {
    success: true,
    contactId,
    ...results,
  };
}

