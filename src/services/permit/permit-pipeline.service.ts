import { prisma } from '../../config/database';
import { shovelsScraperService } from '../scraper/shovels.service';
import { clayClient } from '../../integrations/clay/client';
import { permitSheetsService } from './sheets.service';
import { permitRoutingService } from './routing.service';
import { config } from '../../config';
import { realtimeEmitter } from '../realtime/event-emitter.service';
import { emitJobToConversation, WSEventType } from '../../config/websocket';
import { logger } from '../../utils/logger';
import type { ClayEnrichPayload } from '../../integrations/clay/types';
import { lookupGeoId } from '../../data/geo-ids';

export interface PermitPipelineParams {
  permitType: string;
  city: string;
  geoId: string;
  startDate: string;
  endDate: string;
  conversationId?: string;
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
        },
      });
    }

    const dateRangeDays = Math.ceil(
      (new Date(params.endDate).getTime() - new Date(params.startDate).getTime()) / 86400000
    );

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

    const result = stateAbbr
      ? await shovelsScraperService.scrapeByCity(
          params.permitType, params.city, stateAbbr, dateRangeDays, 100, true
        )
      : await shovelsScraperService.scrapeByPermitTypeAndGeo(
          params.permitType, params.geoId, params.city, dateRangeDays, 100, true
        );

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

    await prisma.permitSearch.update({
      where: { id: search.id },
      data: { status: 'ENRICHING', totalFound: result.totalImported },
    });

    await prisma.contact.updateMany({
      where: {
        source: 'shovels',
        permitType: params.permitType,
        permitCity: params.city,
        createdAt: { gte: new Date(Date.now() - config.defaults.contactFreshnessWindowMs) },
      },
      data: { permitSearchId: search.id },
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
      await prisma.contact.updateMany({
        where: { id: { in: skipClayIds } },
        data: { clayEnrichmentStatus: 'SKIPPED' },
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
    const updates: any = { clayEnrichedAt: new Date() };

    if (enrichedData.email) updates.email = enrichedData.email;
    if (enrichedData.phone) updates.phone = enrichedData.phone;

    const existing = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { email: true, permitSearchId: true },
    });

    const hasEmail = enrichedData.email || existing?.email;
    updates.clayEnrichmentStatus = hasEmail ? 'ENRICHED' : 'INCOMPLETE';

    await prisma.contact.update({ where: { id: contactId }, data: updates });

    if (existing?.permitSearchId) {
      await this.checkAndFinalizeSearch(existing.permitSearchId);
    }
  }

  async checkAndFinalizeSearch(permitSearchId: string): Promise<void> {
    const pending = await prisma.contact.count({
      where: { permitSearchId, clayEnrichmentStatus: 'PENDING' },
    });

    if (pending > 0) return;
    await this.buildSheetForSearch(permitSearchId);
  }

  async buildSheetForSearch(permitSearchId: string): Promise<void> {
    const search = await prisma.permitSearch.findUnique({ where: { id: permitSearchId } });
    if (!search || search.status === 'READY_FOR_REVIEW' || search.status === 'COMPLETED') return;

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
