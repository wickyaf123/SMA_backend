import { ToolDefinition, ToolHandler, ToolRegistry, ToolContext, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { permitPipelineService } from '../../permit/permit-pipeline.service';
import { shovelsScraperService, cancelJob, clearJobSignal } from '../../scraper/shovels.service';
import { shovelsClient, ShovelsCreditLimitError } from '../../../integrations/shovels/client';
import { lookupGeoId, getZipsForCity, getZipsForCounty, getZipsForState } from '../../../data/geo-ids';
import { emitJobToConversation, WSEventType } from '../../../config/websocket';
import { realtimeEmitter } from '../../realtime/event-emitter.service';

const definitions: ToolDefinition[] = [
  {
    name: 'search_permits',
    description:
      'Search for building permits by type, city, and date range. Kicks off a background search job and returns immediately with a job ID. Results arrive asynchronously via real-time notifications — do NOT wait for them. Tell the user the search is running and they can keep chatting.',
    input_schema: {
      type: 'object',
      properties: {
        permitType: {
          type: 'string',
          description:
            'Type of permit (e.g., hvac, plumbing, electrical, roofing, solar)',
        },
        city: { type: 'string', description: 'City to search in' },
        geoId: {
          type: 'string',
          description: 'Geographic ID for the search area',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
        maxResults: {
          type: 'number',
          description:
            'Maximum number of contractor records to return. Default 50, max 500. If user asks for more than 500, use 500 and explain the limit.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Alias for maxResults. Default 50, max 500.',
        },
      },
      required: ['permitType', 'city'],
    },
  },
  {
    name: 'get_permit_searches',
    description: 'Get recent permit search results and their status',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of searches to return (default 10)',
        },
        status: {
          type: 'string',
          description:
            'Filter by status (PENDING, SEARCHING, ENRICHING, COMPLETED, FAILED, CANCELLED)',
        },
      },
    },
  },
  {
    name: 'lookup_geo_id',
    description: 'Look up a FIPS GeoID code for a US city or county. Useful when the user mentions a city not in the hardcoded list. Supports fuzzy matching and common abbreviations (e.g., "LA" for Los Angeles).',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City or county name' },
        state: { type: 'string', description: 'State name or abbreviation (e.g., "CA" or "California")' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_pipeline_status',
    description:
      'Get the current status of the data pipeline including which jobs are running and their progress',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cancel_permit_search',
    description:
      'Cancel one or more active permit searches. Stops the scraping process and marks the search as cancelled. Can cancel a specific search by ID, or cancel all active searches for the current conversation.',
    input_schema: {
      type: 'object',
      properties: {
        searchId: {
          type: 'string',
          description: 'Specific permit search ID to cancel. If omitted, cancels ALL active searches in the current conversation.',
        },
      },
    },
  },
];

function classifySearchError(err: any): string {
  if (err instanceof ShovelsCreditLimitError) {
    return 'Shovels daily credit limit reached — no more API calls allowed today. Contact Stark to adjust the daily cap.';
  }

  const status = err.response?.status;
  const detail = err.response?.data?.detail;

  if (status === 402) {
    const limitInfo = typeof detail === 'object' && detail?.limit
      ? ` (plan limit: ${Number(detail.limit).toLocaleString()} credits)`
      : '';
    return `Shovels API monthly credit limit exceeded${limitInfo}. Contact Stark to reset or upgrade the Shovels plan.`;
  }

  if (status === 429) {
    return 'Shovels API rate limit hit — too many requests. The search will be retried automatically, but if this persists, contact Stark.';
  }

  if (status === 401 || status === 403) {
    return 'Shovels API authentication failed — the API key may be invalid or expired. Contact Stark.';
  }

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return 'Shovels API request timed out. The service may be temporarily slow — try again in a few minutes.';
  }

  if (status && status >= 500) {
    return `Shovels API returned a server error (HTTP ${status}). This is on their end — try again in a few minutes.`;
  }

  return `Permit search failed: ${err.message || 'Unknown error'}. Contact Stark if this continues.`;
}

const handlers: Record<string, ToolHandler> = {
  search_permits: async (input, context) => {
    const startDate = input.startDate || new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];
    const endDate = input.endDate || new Date().toISOString().split('T')[0];
    const maxResults = Math.min(input.limit || input.maxResults || 50, 500);

    // Parse city and state from input (supports "Austin, TX" or separate fields)
    let cityName = input.city || '';
    let stateAbbr = '';
    const geoResult = lookupGeoId(cityName);
    let resolvedGeoId = input.geoId || '';

    if (geoResult && !Array.isArray(geoResult)) {
      resolvedGeoId = geoResult.geoId;
      stateAbbr = geoResult.stateAbbr;
    } else if (Array.isArray(geoResult) && geoResult.length > 0) {
      resolvedGeoId = geoResult[0].geoId;
      stateAbbr = geoResult[0].stateAbbr;
    }

    // Extract state from "City, ST" format if not resolved
    if (!stateAbbr && cityName.includes(',')) {
      const parts = cityName.split(',').map((s: string) => s.trim());
      cityName = parts[0];
      stateAbbr = parts[1]?.toUpperCase() || '';
    }

    if (!cityName) {
      return { success: false, error: 'city is required for permit search', code: 'VALIDATION' };
    }

    // --- Pre-flight Shovels quota check ---
    const quota = await shovelsClient.checkQuota();

    if (quota.isOverLimit) {
      const availMsg = quota.availableAt
        ? ` Credits will free up on ${quota.availableAt}.`
        : '';
      logger.warn(
        { creditsUsed: quota.creditsUsed, creditLimit: quota.creditLimit },
        'Permit search blocked — Shovels monthly credit limit exceeded'
      );
      return {
        success: false,
        error: `Shovels API monthly credit limit reached (${quota.creditsUsed.toLocaleString()} / ${(quota.creditLimit ?? 0).toLocaleString()} credits used).${availMsg} Contact Stark to reset or upgrade the Shovels plan before running more searches.`,
        code: 'QUOTA_EXCEEDED',
        quotaStatus: quota,
      };
    }

    let quotaWarning: string | undefined;
    if (quota.creditLimit != null && quota.usagePercent >= 80) {
      quotaWarning = `⚠️ Shovels API usage is at ${quota.usagePercent}% (${quota.creditsRemaining?.toLocaleString() ?? '?'} credits remaining of ${quota.creditLimit.toLocaleString()}). Consider upgrading the plan soon.`;
      logger.warn(
        { usagePercent: quota.usagePercent, remaining: quota.creditsRemaining, limit: quota.creditLimit },
        'Shovels monthly credit usage above 80% warning threshold'
      );
    }

    // Initialize daily credit limit for this run
    try {
      const { settingsService } = await import('../../settings/settings.service');
      const shovelsSettings = await settingsService.getShovelsSettings();
      shovelsClient.setDailyCreditLimit(shovelsSettings.maxDailyCredits);
    } catch {
      shovelsClient.setDailyCreditLimit(5000);
    }
    shovelsClient.resetRunCounter();

    const dateRangeDays = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
    );

    // Create the record first so we can return the ID immediately
    const search = await prisma.permitSearch.create({
      data: {
        permitType: input.permitType,
        city: cityName,
        geoId: resolvedGeoId || `${cityName.toLowerCase().replace(/\s+/g, '-')}-${stateAbbr.toLowerCase()}`,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'PENDING',
        conversationId: context?.conversationId || null,
        userId: context?.userId || null,
      },
    });

    if (!context?.conversationId) {
      logger.warn({ tool: 'search_permits' }, 'Tool called without conversationId - data will be unscoped');
    }

    // Tier ladder mirrors search_homeowners — never dead-end with a red
    // "No Permits Found" card. Drop tag → widen window → county → statewide.
    // Stop at first tier returning ≥ 1 contractor; emit JOB_COMPLETED with
    // a `widening` envelope so the UI shows "Filters widened: …".
    const runSearch = async () => {
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'SEARCHING' },
      });

      const emitProgress = (event: any) => {
        if (search.conversationId) {
          emitJobToConversation(search.conversationId, WSEventType.JOB_PROGRESS, {
            jobId: search.id,
            jobType: 'permit:search',
            status: 'progress',
            result: {
              permitType: input.permitType,
              city: cityName,
              ...event,
            },
          });
        }
      };

      // Pre-compute zip pools for county / statewide tiers (no extra Shovels calls).
      const cityZips = stateAbbr ? getZipsForCity(cityName, stateAbbr) : [];
      const countyZips = stateAbbr
        ? getZipsForCounty(cityName, stateAbbr).filter((z) => !cityZips.includes(z))
        : [];
      const stateZips = stateAbbr ? getZipsForState(stateAbbr, 30) : [];

      const userYearsBack = Math.max(1, Math.ceil(dateRangeDays / 365));
      const widenedYearsBack = Math.max(userYearsBack * 2, userYearsBack + 2);
      const wideDateRangeDays = widenedYearsBack * 365;

      type TierId = 'A' | 'B' | 'C' | 'D' | 'E';
      type Tier = {
        id: TierId;
        scope: 'city' | 'zips';
        zips: string[]; // only used when scope === 'zips'
        permitType: string; // empty string = no tag
        dateRangeDays: number;
        zipCap: number;
        reason: string;
      };

      const tiers: Tier[] = ([
        {
          id: 'A' as const,
          scope: 'city' as const,
          zips: cityZips,
          permitType: input.permitType,
          dateRangeDays,
          zipCap: 5,
          reason: 'Strict — your exact filters in the requested city.',
        },
        {
          id: 'B' as const,
          scope: 'city' as const,
          zips: cityZips,
          permitType: '',
          dateRangeDays,
          zipCap: 5,
          reason: `No matches with "${input.permitType}" permits — searched all permit types in the city.`,
        },
        {
          id: 'C' as const,
          scope: 'city' as const,
          zips: cityZips,
          permitType: input.permitType,
          dateRangeDays: wideDateRangeDays,
          zipCap: 5,
          reason: `No matches in the original window — widened to last ${widenedYearsBack} years.`,
        },
        {
          id: 'D' as const,
          scope: 'zips' as const,
          zips: countyZips,
          permitType: input.permitType,
          dateRangeDays,
          zipCap: 8,
          reason: `No matches in ${cityName} — searched neighboring cities in the same county.`,
        },
        {
          id: 'E' as const,
          scope: 'zips' as const,
          zips: stateZips,
          permitType: input.permitType,
          dateRangeDays,
          zipCap: 30,
          reason: `Last resort — searched statewide (${stateAbbr || 'state'}) for any "${input.permitType}" permit.`,
        },
      ] satisfies Tier[]).filter((t) => {
        if (t.scope === 'city') return !!stateAbbr; // city tiers need state
        return t.zips.length > 0;
      });

      let appliedTier: Tier | null = null;
      let result: any = null;

      for (const tier of tiers) {
        emitProgress({
          phase: 'searching',
          tier: tier.id,
          message: `Tier ${tier.id}: ${tier.reason}`,
        });

        if (tier.scope === 'city') {
          // Tiers A/B/C: city-level scrape with full Zippopotam fallback inside scrapeByCity.
          // For tier B (no permit type filter), pass a generic placeholder; the
          // existing searchWithTagFallback drops the tag automatically when 0.
          result = await shovelsScraperService.scrapeByCity(
            tier.permitType || input.permitType,
            cityName,
            stateAbbr,
            tier.dateRangeDays,
            maxResults,
            true,
            undefined,
            emitProgress,
            search.id,
          );
        } else {
          // Tiers D/E: explicit zip list (county or state).
          result = await shovelsScraperService.scrapeByZipGeoIds(
            tier.permitType || input.permitType,
            tier.zips.slice(0, tier.zipCap),
            cityName,
            tier.dateRangeDays,
            maxResults,
            true,
            undefined,
            undefined,
            emitProgress,
            search.id,
          );
        }

        if (result?.wasCancelled) break;
        if (result && result.totalScraped >= 1) {
          appliedTier = tier;
          break;
        }
      }

      // ── Cancellation handling ──────────────────────────────────────
      if (result?.wasCancelled) {
        const current = await prisma.permitSearch.findUnique({ where: { id: search.id }, select: { status: true } });
        if (current?.status !== 'CANCELLED') {
          await prisma.permitSearch.update({
            where: { id: search.id },
            data: { status: 'CANCELLED', totalFound: result.totalImported },
          });
        }
        realtimeEmitter.emitJobEvent({
          jobId: search.id,
          jobType: 'permit:search',
          status: 'failed',
          result: { message: 'Search cancelled by user', total: result.totalImported },
        });
        if (search.conversationId) {
          emitJobToConversation(search.conversationId, WSEventType.JOB_FAILED, {
            jobId: search.id,
            jobType: 'permit:search',
            status: 'cancelled',
            result: { message: 'Search cancelled by user', total: result.totalImported },
          });
        }
        clearJobSignal(search.id);
        logger.info({ searchId: search.id, imported: result.totalImported }, 'Permit search cancelled — skipping enrichment');
        return;
      }

      // ── Build widening envelope (mirror homeowner shape) ────────────
      const widening = appliedTier
        ? {
            appliedTier: appliedTier.id,
            wasWidened: appliedTier.id !== 'A',
            originalQuery: {
              city: cityName,
              permitType: input.permitType,
              yearsBack: userYearsBack,
            },
            actualQuery: {
              scope: appliedTier.scope === 'city' ? cityName : `${appliedTier.zips.length} ZIPs`,
              permitType: appliedTier.permitType || '(any)',
              yearsBack: Math.max(1, Math.ceil(appliedTier.dateRangeDays / 365)),
            },
            reason: appliedTier.reason,
          }
        : {
            appliedTier: null,
            wasWidened: false,
            originalQuery: {
              city: cityName,
              permitType: input.permitType,
              yearsBack: userYearsBack,
            },
            reason: `No contractors filed "${input.permitType}" or any other permits in ${cityName}${stateAbbr ? ', ' + stateAbbr : ''} or surrounding ${stateAbbr || 'state'} ZIPs in the searched windows.`,
          };

      // ── Zero-result branch (all tiers exhausted) ───────────────────
      if (!appliedTier || !result || result.totalScraped === 0) {
        await prisma.permitSearch.update({
          where: { id: search.id },
          data: { status: 'COMPLETED', totalFound: 0 },
        });
        const eventPayload = {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'completed' as const,
          result: {
            total: 0,
            permitType: input.permitType,
            city: cityName,
            widening,
            message: widening.reason,
          },
        };
        realtimeEmitter.emitJobEvent(eventPayload);
        if (search.conversationId) {
          emitJobToConversation(search.conversationId, WSEventType.JOB_COMPLETED, eventPayload);
        }
        return;
      }

      // ── Found something — proceed with enrichment ──────────────────
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'ENRICHING', totalFound: result.totalImported },
      });

      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_PROGRESS, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'progress',
          result: {
            permitType: input.permitType,
            city: cityName,
            phase: 'enriching',
            imported: result.totalImported,
            duplicates: result.duplicates,
            filtered: result.filtered,
            widening,
            message: `Imported ${result.totalImported} contacts (Tier ${appliedTier.id}), enriching emails...`,
          },
        });
      }

      // Send to Clay enrichment (non-blocking) — finalization happens via
      // webhook callback -> handleClayCallback -> checkAndFinalizeSearch -> buildSheetForSearch
      // which emits JOB_COMPLETED to the conversation when done
      permitPipelineService.sendToClayEnrichment(search.id).catch((err) => {
        logger.warn({ err: err.message, searchId: search.id }, 'Clay enrichment skipped or failed');
      });
    };

    realtimeEmitter.emitJobEvent({
      jobId: search.id,
      jobType: 'permit:search',
      status: 'started',
    });

    if (context?.conversationId) {
      emitJobToConversation(context.conversationId, WSEventType.JOB_STARTED, {
        jobId: search.id,
        jobType: 'permit:search',
        status: 'started',
        result: { permitType: input.permitType, city: cityName },
      });
    }

    runSearch().catch(async (err: any) => {
      logger.error({ err: err.message, searchId: search.id, status: err.response?.status, code: err.code }, 'Permit search pipeline failed');

      const friendlyError = classifySearchError(err);

      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'FAILED' },
      }).catch(() => {});
      if (context?.conversationId) {
        emitJobToConversation(context.conversationId, WSEventType.JOB_FAILED, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'failed',
          error: friendlyError,
        });
      }
    });

    return {
      success: true,
      data: {
        searchId: search.id,
        status: 'SEARCHING',
        maxResults,
        message: `Permit search for ${input.permitType} permits in ${cityName}${stateAbbr ? ', ' + stateAbbr : ''} has been started (up to ${maxResults} records). Results will arrive via real-time notifications when the search completes.`,
        ...(quotaWarning && { quotaWarning }),
      },
    };
  },

  get_permit_searches: async (input) => {
    const limit = input.limit || 10;
    const where: Record<string, any> = {};
    if (input.status) {
      where.status = input.status;
    }
    const searches = await prisma.permitSearch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        permitType: true,
        city: true,
        geoId: true,
        status: true,
        totalFound: true,
        totalEnriched: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { success: true, data: searches };
  },

  lookup_geo_id: async (input) => {
    const { city, state } = input;
    if (!city) return { success: false, error: 'city is required', code: 'VALIDATION' };

    const result = lookupGeoId(city, state);

    if (!result) {
      return {
        success: true,
        data: {
          found: false,
          message: `No GeoID found for "${city}${state ? ', ' + state : ''}". The city may not be in the Shovels geo index. Please ask the user for their county FIPS code.`,
        },
      };
    }

    if (Array.isArray(result)) {
      return {
        success: true,
        data: {
          found: true,
          multiple: true,
          city,
          message: `Multiple matches found for "${city}". Please confirm which one:`,
          matches: result.map(r => ({
            geoId: r.geoId,
            county: r.county,
            state: r.state,
            stateAbbr: r.stateAbbr,
          })),
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        geoId: result.geoId,
        city,
        county: result.county,
        state: result.state,
        stateAbbr: result.stateAbbr,
      },
    };
  },

  get_pipeline_status: async () => {
    const settings = await prisma.settings.findFirst();
    const recentMetrics = await prisma.dailyMetrics.findFirst({
      orderBy: { date: 'desc' },
    });
    const recentSearches = await prisma.permitSearch.findMany({
      where: {
        status: { in: ['PENDING', 'SEARCHING', 'ENRICHING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      success: true,
      data: {
        controls: {
          pipelineEnabled: settings?.pipelineEnabled ?? false,
          emailOutreachEnabled: settings?.emailOutreachEnabled ?? false,
          smsOutreachEnabled: settings?.smsOutreachEnabled ?? false,
          linkedinGloballyEnabled: settings?.linkedinGloballyEnabled ?? false,
          schedulerEnabled: settings?.schedulerEnabled ?? false,
          scrapeJobEnabled: settings?.scrapeJobEnabled ?? false,
          shovelsJobEnabled: settings?.shovelsJobEnabled ?? false,
          homeownerJobEnabled: settings?.homeownerJobEnabled ?? false,
          connectionJobEnabled: settings?.connectionJobEnabled ?? false,
          enrichJobEnabled: settings?.enrichJobEnabled ?? false,
          mergeJobEnabled: settings?.mergeJobEnabled ?? true,
          validateJobEnabled: settings?.validateJobEnabled ?? true,
          enrollJobEnabled: settings?.enrollJobEnabled ?? true,
        },
        latestMetrics: recentMetrics,
        activeSearches: recentSearches,
      },
    };
  },

  cancel_permit_search: async (input, context) => {
    const searchId = input.searchId;
    const conversationId = context?.conversationId;

    let searches;
    if (searchId) {
      const search = await prisma.permitSearch.findUnique({ where: { id: searchId } });
      if (!search) {
        return { success: false, error: `Permit search ${searchId} not found`, code: 'VALIDATION' };
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(search.status)) {
        return {
          success: true,
          data: { message: `Search ${searchId} is already ${search.status.toLowerCase()}, no action needed.`, searchId, status: search.status },
        };
      }
      searches = [search];
    } else if (conversationId) {
      searches = await prisma.permitSearch.findMany({
        where: {
          conversationId,
          status: { in: ['PENDING', 'SEARCHING', 'ENRICHING'] },
        },
      });
    } else {
      return { success: false, error: 'Please specify a searchId or use this within a conversation so I know which searches to cancel.', code: 'VALIDATION' as ToolErrorCode };
    }

    if (searches.length === 0) {
      return { success: true, data: { message: 'No active permit searches found to cancel.', cancelled: 0 } };
    }

    const cancelled: string[] = [];
    for (const search of searches) {
      cancelJob(search.id);

      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'CANCELLED' },
      });

      realtimeEmitter.emitJobEvent({
        jobId: search.id,
        jobType: 'permit:search',
        status: 'failed',
        result: { message: 'Search cancelled by user' },
      });

      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_FAILED, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'cancelled',
          result: { message: 'Search cancelled by user' },
        });
      }

      // Signal cleanup is handled by the scraper when it detects cancellation (L216).
      // Do NOT clear here — the scraper checks asynchronously and would miss the signal.
      cancelled.push(search.id);
      logger.info({ searchId: search.id }, 'Permit search cancelled via tool');
    }

    return {
      success: true,
      data: {
        message: `Successfully cancelled ${cancelled.length} permit search(es).`,
        cancelled: cancelled.length,
        searchIds: cancelled,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register({ ...def, domain: 'permit' }, handlers[def.name]);
  }
}
