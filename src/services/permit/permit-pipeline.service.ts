import { prisma } from '../../config/database';
import { shovelsScraperService, clearJobSignal } from '../scraper/shovels.service';
import { shovelsClient } from '../../integrations/shovels/client';
import { clayClient } from '../../integrations/clay/client';
import { HunterEnrichmentService } from '../enrichment/hunter.service';
import { permitSheetsService } from './sheets.service';
import { permitRoutingService } from './routing.service';
import { config } from '../../config';
import { realtimeEmitter } from '../realtime/event-emitter.service';
import { emitJobToConversation, WSEventType } from '../../config/websocket';
import { logger } from '../../utils/logger';
import type { ClayEnrichPayload } from '../../integrations/clay/types';
import { lookupGeoId } from '../../data/geo-ids';
import { logIssue } from '../observability/issue-log.service';

export interface PermitPipelineParams {
  permitType: string;
  city: string;
  geoId: string;
  startDate: string;
  endDate: string;
  maxResults?: number;
  conversationId?: string;
  userId?: string;
}

export class PermitPipelineService {
  async startSearch(params: PermitPipelineParams, existingSearchId?: string): Promise<string> {
    let search;
    if (existingSearchId) {
      search = await prisma.permitSearch.update({
        where: { id: existingSearchId },
        data: { status: 'SEARCHING' },
      });
    } else {
      search = await prisma.permitSearch.create({
        data: {
          permitType: params.permitType,
          city: params.city,
          geoId: params.geoId,
          startDate: new Date(params.startDate),
          endDate: new Date(params.endDate),
          status: 'SEARCHING',
          conversationId: params.conversationId || null,
          ...(params.userId && { userId: params.userId }),
        },
      });
    }

    const dateRangeDays = Math.ceil(
      (new Date(params.endDate).getTime() - new Date(params.startDate).getTime()) / 86400000
    );

    // Initialize credit limit for this pipeline run
    try {
      const { settingsService } = await import('../settings/settings.service');
      const shovelsSettings = await settingsService.getShovelsSettings();
      shovelsClient.setDailyCreditLimit(shovelsSettings.maxDailyCredits);
    } catch {
      shovelsClient.setDailyCreditLimit(5000);
    }
    shovelsClient.resetRunCounter();

    realtimeEmitter.emitJobEvent({
      jobId: search.id,
      jobType: 'permit:search',
      status: 'started',
    });

    if (search.conversationId) {
      emitJobToConversation(search.conversationId, WSEventType.JOB_STARTED, {
        jobId: search.id,
        jobType: 'permit:search',
        status: 'started',
        result: { permitType: params.permitType, city: params.city },
      });
    }

    // Prefer scrapeByCity (multi-tier zip fallback) when we can resolve a state abbreviation
    const geoEntry = lookupGeoId(params.city);
    const stateAbbr = geoEntry && !Array.isArray(geoEntry) ? geoEntry.stateAbbr
      : Array.isArray(geoEntry) && geoEntry.length > 0 ? geoEntry[0].stateAbbr
      : null;

    const emitProgress = (event: any) => {
      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_PROGRESS, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'progress',
          result: { permitType: params.permitType, city: params.city, ...event },
        });
      }
    };

    const maxResults = Math.min(params.maxResults || 50, 500);

    const result = stateAbbr
      ? await shovelsScraperService.scrapeByCity(
          params.permitType, params.city, stateAbbr, dateRangeDays, maxResults, true,
          undefined, emitProgress, search.id
        )
      : await shovelsScraperService.scrapeByPermitTypeAndGeo(
          params.permitType, params.geoId, params.city, dateRangeDays, maxResults, true,
          undefined, undefined, emitProgress, search.id
        );

    clearJobSignal(search.id);

    // If the scraper returned errors and no results, mark as failed
    if (result.totalScraped === 0 && result.errors.length > 0) {
      const errorMsg = result.errors.join('; ');
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'FAILED', totalFound: 0 },
      });

      realtimeEmitter.emitJobEvent({
        jobId: search.id,
        jobType: 'permit:search',
        status: 'failed',
        result: { error: errorMsg },
      });

      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_FAILED, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'failed',
          error: errorMsg,
        });
      }

      return search.id;
    }

    // Zero results but NO errors — Shovels returned an empty set cleanly.
    // Previously this path fell through to enrichment, leaving the search
    // stuck at ENRICHING forever and the UI showing a frozen progress card.
    // Now we short-circuit with a JOB_COMPLETED carrying a diagnostics
    // envelope so the frontend can render a "no data" card and Jerry can
    // explain why. Logged as SILENT_EMPTY_RESULT so the admin dashboard
    // surfaces the pattern.
    if (result.totalScraped === 0) {
      const diagnostics = {
        rawCount: 0,
        imported: 0,
        duplicates: result.duplicates ?? 0,
        filtered: result.filtered ?? 0,
        reason: (result as any).filtered > 0
          ? 'Shovels returned permits but relevance filter rejected all of them'
          : 'No permits returned from Shovels for this trade/city/window',
        permitType: params.permitType,
        city: params.city,
        startDate: params.startDate,
        endDate: params.endDate,
      };

      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'COMPLETED', totalFound: 0 },
      });

      void logIssue({
        category: 'SILENT_EMPTY_RESULT',
        severity: 'INFO',
        message: `Permit search returned 0 results (${params.permitType} in ${params.city})`,
        conversationId: search.conversationId ?? null,
        jobId: search.id,
        payload: diagnostics,
      });

      realtimeEmitter.emitJobEvent({
        jobId: search.id,
        jobType: 'permit:search',
        status: 'completed',
        result: { total: 0, diagnostics },
      });

      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_COMPLETED, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'completed',
          result: {
            total: 0,
            enriched: 0,
            incomplete: 0,
            permitType: params.permitType,
            city: params.city,
            diagnostics,
          },
        });
      }

      return search.id;
    }

    // Atomically link contacts and update status to prevent race conditions
    await prisma.$transaction(async (tx) => {
      await tx.permitSearch.update({
        where: { id: search.id },
        data: { status: 'ENRICHING', totalFound: result.totalImported },
      });

      await tx.contact.updateMany({
        where: {
          source: 'shovels',
          permitType: params.permitType,
          permitCity: params.city,
          permitSearchId: null,
          createdAt: { gte: new Date(Date.now() - config.defaults.contactFreshnessWindowMs) },
        },
        data: { permitSearchId: search.id },
      });
    });

    emitProgress({
      phase: 'enriching',
      imported: result.totalImported,
      duplicates: result.duplicates,
      filtered: result.filtered,
      message: `Imported ${result.totalImported} contacts, enriching emails...`,
    });

    await this.sendToClayEnrichment(search.id);
    return search.id;
  }

  async sendToClayEnrichment(permitSearchId: string): Promise<void> {
    const contacts = await prisma.contact.findMany({
      where: { permitSearchId },
      include: { company: true },
    });

    const needsClay: typeof contacts = [];
    const skipClayIds: string[] = [];

    for (const c of contacts) {
      if (c.email) {
        skipClayIds.push(c.id);
      } else {
        needsClay.push(c);
      }
    }

    if (skipClayIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.contact.updateMany({
          where: { id: { in: skipClayIds } },
          data: { clayEnrichmentStatus: 'SKIPPED' },
        });
      });
      logger.info(
        { permitSearchId, skipped: skipClayIds.length },
        'Contacts with Shovels email marked SKIPPED — Clay not needed'
      );
    }

    if (needsClay.length === 0) {
      logger.info({ permitSearchId }, 'All contacts have email from Shovels, skipping Clay entirely');
      await this.buildSheetForSearch(permitSearchId);
      return;
    }

    const payload: ClayEnrichPayload[] = needsClay.map(c => {
      const ed = (c as any).enrichmentData || {};
      return {
        contactId: c.id,
        email: null,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        companyName: c.company?.name || null,
        companyDomain: c.company?.domain || null,
        permitType: (c as any).permitType || null,
        permitCity: (c as any).permitCity || null,
        permitSearchId,
        shovelsHasEmail: false,
        shovelsHasPhone: !!c.phone,
        seniorityLevel: ed.seniorityLevel || null,
        jobTitle: ed.jobTitle || null,
      };
    });

    try {
      await clayClient.enrichContacts(payload);
      logger.info(
        { sent: payload.length, skipped: skipClayIds.length, permitSearchId },
        'Contacts sent to Clay (only those missing email)'
      );
    } catch (err: any) {
      logger.error({ err: err.message, permitSearchId }, 'Failed to send to Clay, building sheet from raw data');
      await this.buildSheetForSearch(permitSearchId);
    }
  }

  async handleClayCallback(contactId: string, enrichedData: any): Promise<void> {
    const existing = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { email: true, permitSearchId: true },
    });

    // Guard against late-arriving webhooks for searches the user has already
    // cancelled or that failed. Without this guard, Clay could stamp
    // `clayEnrichedAt` onto contacts belonging to a terminal-state search
    // and re-trigger checkAndFinalizeSearch, corrupting the audit trail.
    if (existing?.permitSearchId) {
      const search = await prisma.permitSearch.findUnique({
        where: { id: existing.permitSearchId },
        select: { status: true },
      });
      if (!search || ['CANCELLED', 'FAILED'].includes(search.status)) {
        logger.info(
          { contactId, permitSearchId: existing.permitSearchId, status: search?.status ?? 'missing' },
          'Clay callback ignored — parent permit search is in a terminal state'
        );
        return;
      }
    }

    const updates: any = { clayEnrichedAt: new Date() };

    if (enrichedData.email) updates.email = enrichedData.email;
    if (enrichedData.phone) updates.phone = enrichedData.phone;

    const hasEmail = enrichedData.email || existing?.email;
    updates.clayEnrichmentStatus = hasEmail ? 'ENRICHED' : 'INCOMPLETE';

    await prisma.contact.update({ where: { id: contactId }, data: updates });

    if (existing?.permitSearchId) {
      await this.checkAndFinalizeSearch(existing.permitSearchId);
    }
  }

  async checkAndFinalizeSearch(permitSearchId: string): Promise<void> {
    // Don't finalize a search that the user cancelled or that failed —
    // downstream Clay webhooks can still land on individual contacts long
    // after the parent search has been marked terminal. buildSheetForSearch
    // already short-circuits on READY_FOR_REVIEW/COMPLETED, extend the same
    // protection to CANCELLED and FAILED so we never re-enter the pipeline.
    const search = await prisma.permitSearch.findUnique({
      where: { id: permitSearchId },
      select: { status: true },
    });
    if (!search || ['CANCELLED', 'FAILED'].includes(search.status)) return;

    const pending = await prisma.contact.count({
      where: { permitSearchId, clayEnrichmentStatus: 'PENDING' },
    });

    if (pending > 0) return;
    await this.buildSheetForSearch(permitSearchId);
  }

  async buildSheetForSearch(permitSearchId: string): Promise<void> {
    const search = await prisma.permitSearch.findUnique({ where: { id: permitSearchId } });
    if (!search || search.status === 'READY_FOR_REVIEW' || search.status === 'COMPLETED') return;

    await this.sendToHunterEnrichment(permitSearchId);
    await this.tagFallbackContacts(permitSearchId);

    const [enriched, skipped, incomplete, raw] = await Promise.all([
      prisma.contact.findMany({
        where: { permitSearchId, clayEnrichmentStatus: 'ENRICHED' },
        include: { company: true },
      }),
      prisma.contact.findMany({
        where: { permitSearchId, clayEnrichmentStatus: 'SKIPPED' },
        include: { company: true },
      }),
      prisma.contact.findMany({
        where: { permitSearchId, clayEnrichmentStatus: 'INCOMPLETE' },
        include: { company: true },
      }),
      prisma.contact.findMany({
        where: { permitSearchId },
        include: { company: true },
      }),
    ]);

    const allEnriched = [...enriched, ...skipped];

    // Build a preview of top contacts for chat display
    const contactPreview = raw.slice(0, 10).map(c => ({
      id: c.id,
      name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
      company: c.company?.name || '',
      email: c.email || '',
      phone: c.phone || '',
      permitType: (c as any).permitType || '',
      city: c.city || '',
    }));

    const sheetsConfigured = !!(config.googleSheets.serviceAccountEmail && config.googleSheets.privateKey);
    let sheetUrl: string | undefined;
    let sheetId: string | undefined;

    if (sheetsConfigured) {
      try {
        const title = `Permits - ${search.permitType} - ${search.city} - ${new Date().toLocaleDateString()}`;
        const result = await permitSheetsService.createPermitSheet(title);
        sheetId = result.sheetId;
        sheetUrl = result.sheetUrl;

        await Promise.all([
          permitSheetsService.writeContactsToTab(sheetId, 'Raw', raw),
          permitSheetsService.writeContactsToTab(sheetId, 'Enriched', allEnriched),
          permitSheetsService.writeContactsToTab(sheetId, 'Incomplete', incomplete),
        ]);

        logger.info({ permitSearchId, sheetUrl }, 'Permit sheet built and ready for review');
      } catch (err: any) {
        logger.warn({ permitSearchId, err: err.message }, 'Failed to create Google Sheet — continuing without sheet');
      }
    } else {
      logger.info({ permitSearchId }, 'Google Sheets not configured — skipping sheet creation');
    }

    await prisma.permitSearch.update({
      where: { id: permitSearchId },
      data: {
        status: 'READY_FOR_REVIEW',
        totalEnriched: allEnriched.length,
        totalIncomplete: incomplete.length,
        ...(sheetUrl ? { googleSheetUrl: sheetUrl, googleSheetId: sheetId } : {}),
      },
    });

    const completedResult = {
      sheetUrl,
      total: raw.length,
      enriched: allEnriched.length,
      incomplete: incomplete.length,
      permitType: search.permitType,
      city: search.city,
      contacts: contactPreview,
      // Carry forward the diagnostics captured during the tier ladder so the
      // UI can render "Found X of Y — Z filtered out" on the success card.
      ...(search.diagnostics ? { diagnostics: search.diagnostics } : {}),
    };

    realtimeEmitter.emitJobEvent({
      jobId: permitSearchId,
      jobType: 'permit:sheet_ready',
      status: 'completed',
      result: completedResult,
    });

    if (search.conversationId) {
      emitJobToConversation(search.conversationId, WSEventType.JOB_COMPLETED, {
        jobId: permitSearchId,
        jobType: 'permit:search',
        status: 'completed',
        result: completedResult,
      });
    }
  }

  async recoverStuckSearches(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const stuckSearches = await prisma.permitSearch.findMany({
      where: {
        status: 'ENRICHING',
        updatedAt: { lt: cutoff },
      },
      select: { id: true, conversationId: true, permitType: true, city: true, createdAt: true },
    });

    if (stuckSearches.length === 0) return 0;

    logger.info({ count: stuckSearches.length, maxAgeMs }, 'Recovering stuck ENRICHING searches');

    const { logIssue } = await import('../observability/issue-log.service');

    for (const search of stuckSearches) {
      // Classify: was Clay silent (no callbacks) or did we just run out of
      // time enriching a legitimate backlog? If ALL contacts for this search
      // are still PENDING, it's a Clay webhook timeout — surface that clearly
      // so the user/admin can see it vs. a normal in-progress enrichment.
      const pendingCount = await prisma.contact.count({
        where: { permitSearchId: search.id, clayEnrichmentStatus: 'PENDING' },
      });
      const totalCount = await prisma.contact.count({
        where: { permitSearchId: search.id },
      });
      const clayTimeout = totalCount > 0 && pendingCount === totalCount;
      const elapsedMs = Date.now() - search.createdAt.getTime();

      if (clayTimeout) {
        void logIssue({
          category: 'CLAY_WEBHOOK_TIMEOUT',
          severity: 'ERROR',
          message: `Clay enrichment timeout for ${search.permitType || 'permit'} search in ${search.city || 'unknown'} — ${pendingCount}/${totalCount} contacts still PENDING after ${Math.round(elapsedMs / 60000)} min`,
          conversationId: search.conversationId ?? null,
          jobId: search.id,
          payload: {
            pendingCount,
            totalCount,
            elapsedMinutes: Math.round(elapsedMs / 60000),
            permitType: search.permitType,
            city: search.city,
          },
        });
      }

      // Mark remaining PENDING contacts as INCOMPLETE so finalization can proceed
      await prisma.contact.updateMany({
        where: { permitSearchId: search.id, clayEnrichmentStatus: 'PENDING' },
        data: { clayEnrichmentStatus: 'INCOMPLETE' },
      });

      // Annotate the search's diagnostics blob with the recovery context so
      // the UI's success-state card can render "Warning: Clay enrichment
      // timed out — contacts have partial data."
      const existing = await prisma.permitSearch.findUnique({
        where: { id: search.id },
        select: { diagnostics: true },
      });
      const mergedDiagnostics: any = {
        ...((existing?.diagnostics as any) || {}),
        recovered: true,
        recoveryReason: clayTimeout
          ? 'Clay enrichment webhook never completed — contacts finalized with partial data.'
          : 'Enrichment timed out before all contacts completed — remaining contacts marked INCOMPLETE.',
        recoveryElapsedMinutes: Math.round(elapsedMs / 60000),
      };
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { diagnostics: mergedDiagnostics },
      });

      void logIssue({
        category: 'STUCK_JOB_RECOVERED',
        severity: 'WARN',
        message: `Stuck permit search recovered (${pendingCount}/${totalCount} pending, ${Math.round(elapsedMs / 60000)} min elapsed)`,
        conversationId: search.conversationId ?? null,
        jobId: search.id,
        payload: { pendingCount, totalCount, clayTimeout },
      });

      await this.buildSheetForSearch(search.id);
    }

    return stuckSearches.length;
  }

  async approveAndRoute(permitSearchId: string): Promise<{ routed: number; failed: number }> {
    const search = await prisma.permitSearch.findUnique({ where: { id: permitSearchId } });
    if (!search) throw new Error(`Permit search ${permitSearchId} not found`);
    if (search.status !== 'READY_FOR_REVIEW') {
      throw new Error(`Cannot approve search in status "${search.status}" — must be READY_FOR_REVIEW`);
    }

    await prisma.permitSearch.update({
      where: { id: permitSearchId },
      data: { status: 'APPROVED' },
    });

    realtimeEmitter.emitJobEvent({
      jobId: permitSearchId,
      jobType: 'permit:approved',
      status: 'started',
    });

    await prisma.permitSearch.update({
      where: { id: permitSearchId },
      data: { status: 'ROUTING' },
    });

    const result = await permitRoutingService.routeSearch(permitSearchId);

    logger.info({ permitSearchId, ...result }, 'Permit search approved and routed');
    return result;
  }

  private async sendToHunterEnrichment(permitSearchId: string): Promise<void> {
    const contacts = await prisma.contact.findMany({
      where: {
        permitSearchId,
        clayEnrichmentStatus: 'INCOMPLETE',
        email: null,
        hunterEnrichedAt: null,
      },
      select: { id: true },
    });

    if (contacts.length === 0) {
      logger.info({ permitSearchId }, 'No incomplete contacts to send to Hunter');
      return;
    }

    logger.info({ permitSearchId, count: contacts.length }, 'Sending incomplete contacts to Hunter.io');

    const hunterService = new HunterEnrichmentService();
    let enrichedCount = 0;

    for (const contact of contacts) {
      try {
        const result = await hunterService.enrichContact(contact.id);

        if (result.success) {
          enrichedCount++;
          await prisma.contact.update({
            where: { id: contact.id },
            data: { clayEnrichmentStatus: 'ENRICHED' },
          });
          await prisma.activityLog.create({
            data: {
              contactId: contact.id,
              action: 'hunter_enrichment_success',
              description: `Email found (confidence: ${result.confidence || 'N/A'})`,
            },
          });
        } else {
          await prisma.activityLog.create({
            data: {
              contactId: contact.id,
              action: 'hunter_enrichment_failed',
              description: `Email lookup: ${result.error || 'No email found'}`,
            },
          });
        }

        // Rate limit: 1 second between Hunter API calls
        if (contacts.indexOf(contact) < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        logger.warn({ contactId: contact.id, error: err.message }, 'Hunter enrichment failed for contact');
      }
    }

    logger.info(
      { permitSearchId, total: contacts.length, enriched: enrichedCount },
      'Hunter.io enrichment pass complete'
    );
  }

  private async tagFallbackContacts(permitSearchId: string): Promise<void> {
    const incompleteContacts = await prisma.contact.findMany({
      where: { permitSearchId, clayEnrichmentStatus: 'INCOMPLETE' },
      select: { id: true, email: true, phone: true, tags: true },
    });

    for (const contact of incompleteContacts) {
      const tags = new Set(contact.tags);
      if (!contact.email) {
        tags.add('email_not_found');
        if (contact.phone) {
          tags.add('no_email_sms_fallback');
        } else {
          tags.add('no_contact_available');
        }
      }
      if (tags.size !== contact.tags.length) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { tags: Array.from(tags) },
        });
        await prisma.activityLog.create({
          data: {
            contactId: contact.id,
            action: 'email_not_found',
            description: 'All enrichment sources exhausted without finding an email address',
          },
        });
      }
    }

    const emailNotFound = incompleteContacts.filter(c => !c.email).length;
    const withPhone = incompleteContacts.filter(c => !c.email && c.phone).length;
    const noContact = incompleteContacts.filter(c => !c.email && !c.phone).length;
    if (emailNotFound > 0) {
      logger.info(
        { permitSearchId, emailNotFound, smsFallback: withPhone, noContact },
        'Fallback tags applied to incomplete contacts'
      );
    }
  }
}

export const permitPipelineService = new PermitPipelineService();
