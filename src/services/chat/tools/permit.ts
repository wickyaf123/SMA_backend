import { ToolDefinition, ToolHandler, ToolRegistry, ToolContext, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { permitPipelineService } from '../../permit/permit-pipeline.service';
import { shovelsScraperService } from '../../scraper/shovels.service';
import { lookupGeoId } from '../../../data/geo-ids';
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
            'Filter by status (PENDING, SEARCHING, ENRICHING, COMPLETED, FAILED)',
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
];

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
      },
    });

    // Use scrapeByCity for multi-tier fallback (slug -> zip expansion -> FIPS)
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

      let result;
      if (stateAbbr) {
        result = await shovelsScraperService.scrapeByCity(
          input.permitType, cityName, stateAbbr,
          dateRangeDays, maxResults, true,
          undefined,
          emitProgress,
          search.id
        );
      } else {
        result = await shovelsScraperService.scrapeByPermitTypeAndGeo(
          input.permitType, resolvedGeoId, cityName,
          dateRangeDays, maxResults, true,
          undefined, undefined,
          emitProgress,
          search.id
        );
      }

      if (result.totalScraped === 0) {
        const baseMsg = result.errors.length > 0
          ? `Search failed: ${result.errors.join('; ')}`
          : `No ${input.permitType} contractors found in ${cityName}${stateAbbr ? ', ' + stateAbbr : ''} for the selected date range. Tried ${result.searchesRun} geo format(s).`;
        const diagnosticMsg = result.diagnostics
          ? `${baseMsg} | Diagnostics: ${result.diagnostics}`
          : baseMsg;

        await prisma.permitSearch.update({
          where: { id: search.id },
          data: {
            status: result.errors.length > 0 ? 'FAILED' : 'COMPLETED',
            totalFound: 0,
          },
        });

        const eventType = result.errors.length > 0 ? WSEventType.JOB_FAILED : WSEventType.JOB_COMPLETED;
        realtimeEmitter.emitJobEvent({
          jobId: search.id,
          jobType: 'permit:search',
          status: result.errors.length > 0 ? 'failed' : 'completed',
          result: { total: 0, message: diagnosticMsg, searchesRun: result.searchesRun },
        });

        if (search.conversationId) {
          emitJobToConversation(search.conversationId, eventType, {
            jobId: search.id,
            jobType: 'permit:search',
            status: result.errors.length > 0 ? 'failed' : 'completed',
            result: { total: 0, message: diagnosticMsg, searchesRun: result.searchesRun },
          });
        }
        return;
      }

      // Scraping done — atomically link contacts and update status to prevent race conditions
      await prisma.$transaction(async (tx) => {
        await tx.permitSearch.update({
          where: { id: search.id },
          data: { status: 'ENRICHING', totalFound: result.totalImported },
        });

        await tx.contact.updateMany({
          where: {
            source: 'shovels',
            permitType: input.permitType,
            permitCity: cityName,
            permitSearchId: null,
            createdAt: { gte: new Date(Date.now() - config.defaults.contactFreshnessWindowMs) },
          },
          data: { permitSearchId: search.id },
        });
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
            message: `Imported ${result.totalImported} contacts, enriching emails...`,
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
      logger.error({ err: err.message, searchId: search.id }, 'Permit search pipeline failed');
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'FAILED' },
      }).catch(() => {});
      if (context?.conversationId) {
        emitJobToConversation(context.conversationId, WSEventType.JOB_FAILED, {
          jobId: search.id,
          jobType: 'permit:search',
          status: 'failed',
          error: err.message,
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
          message: `No GeoID found for "${city}${state ? ', ' + state : ''}". The city may not be in our database. Please ask the user for their county FIPS code.`,
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
          schedulerEnabled: settings?.schedulerEnabled ?? false,
          scrapeJobEnabled: settings?.scrapeJobEnabled ?? false,
          enrichJobEnabled: settings?.enrichJobEnabled ?? false,
        },
        latestMetrics: recentMetrics,
        activeSearches: recentSearches,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}
