import { ToolDefinition, ToolHandler, ToolRegistry, ToolContext, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { realieEnrichmentService } from '../../enrichment/realie.service';
import { shovelsHomeownerEnrichmentService } from '../../enrichment/shovels-homeowner.service';
import { connectionService } from '../../connection/connection.service';
import { shovelsClient } from '../../../integrations/shovels/client';
import { lookupGeoId } from '../../../data/geo-ids';
import { homeownerScraperService } from '../../scraper/homeowner.service';
import { emitJobToConversation, WSEventType } from '../../../config/websocket';
import { realtimeEmitter } from '../../realtime/event-emitter.service';
import { logger } from '../../../utils/logger';

const definitions: ToolDefinition[] = [
  {
    name: 'list_homeowners',
    description:
      'List homeowners pulled from permit data with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search by name, email, or address',
        },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        status: { type: 'string', description: 'Filter by status' },
        propertyValueMin: { type: 'number', description: 'Minimum property value filter' },
        propertyValueMax: { type: 'number', description: 'Maximum property value filter' },
        page: { type: 'number', description: 'Page number' },
        limit: { type: 'number', description: 'Results per page' },
      },
    },
  },
  {
    name: 'search_homeowners',
    description:
      'Search for homeowners by permit signals. Kicks off a background search and returns immediately with results via websocket progress.',
    input_schema: {
      type: 'object',
      properties: {
        trade: {
          type: 'string',
          enum: ['solar', 'hvac', 'roofing', 'electrical', 'pool_spa', 'general_contractor'],
          description: 'Contractor trade',
        },
        targetingMode: {
          type: 'string',
          enum: ['cross_permit', 'aging'],
          description: "cross_permit = homeowners who don't have the trade yet; aging = homeowners due for replacement",
        },
        permitTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permit types to search for',
        },
        dateRanges: {
          type: 'array',
          items: { type: 'string' },
          description: 'Date range filters (e.g., "1year", "2years", "5-7years")',
        },
        geoId: { type: 'string', description: 'GeoID or zip code for search area' },
        city: { type: 'string', description: 'City name for the search' },
        maxResults: { type: 'number', description: 'Maximum number of homeowner records (default 250)' },
        propertyValueRange: {
          type: 'string',
          description: 'Property value filter (e.g., "400k-700k", "1m+", "any")',
        },
        channels: {
          type: 'string',
          description: 'Preferred outreach channels (email, sms, both, linkedin)',
        },
      },
      required: ['trade', 'targetingMode', 'permitTypes', 'city'],
    },
  },
  {
    name: 'update_conversation_title',
    description:
      'Update the current conversation title. Used after collecting trade + location to set formatted title.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'New title for the conversation' },
      },
      required: ['title'],
    },
  },
  {
    name: 'delete_homeowner',
    description: 'Delete a homeowner record from the database by ID.',
    input_schema: {
      type: 'object',
      properties: {
        homeownerId: { type: 'string', description: 'The homeowner ID to delete' },
      },
      required: ['homeownerId'],
    },
  },
  {
    name: 'enrich_homeowners',
    description:
      'Trigger property data enrichment for homeowners that haven\'t been enriched yet. Enriches property data like assessed value, AVM, bedrooms, etc.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to enrich in this batch (default 50)',
        },
      },
    },
  },
  {
    name: 'enrich_homeowner_contacts',
    description:
      'Find email and phone for homeowners by looking up residents at the homeowner\'s permit address and matching by name to populate contact details and demographics.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to enrich in this batch (default 50)',
        },
      },
    },
  },
  {
    name: 'list_connections',
    description:
      'List contractor-homeowner connections (links between contacts and homeowners via permits).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by name, email, or address' },
        permitType: { type: 'string', description: 'Filter by permit type' },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: { type: 'number', description: 'Results per page (default 25)' },
      },
    },
  },
  {
    name: 'resolve_connections',
    description:
      'Resolve contractor-homeowner connections by matching permits to contractors in the database. Processes homeowners that don\'t yet have connections.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to process (default 50)',
        },
      },
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_homeowners: async (input) => {
    const page = input.page || 1;
    const limit = input.limit || 20;
    const skip = (page - 1) * limit;
    const where: Record<string, any> = {};

    if (input.search) {
      where.OR = [
        { firstName: { contains: input.search, mode: 'insensitive' } },
        { lastName: { contains: input.search, mode: 'insensitive' } },
        { email: { contains: input.search, mode: 'insensitive' } },
        { street: { contains: input.search, mode: 'insensitive' } },
      ];
    }
    if (input.city) where.city = input.city;
    if (input.state) where.state = input.state;
    if (input.status) where.status = input.status;

    if (input.propertyValueMin || input.propertyValueMax) {
      const valueFilter: any = {};
      if (input.propertyValueMin) valueFilter.gte = input.propertyValueMin;
      if (input.propertyValueMax) valueFilter.lte = input.propertyValueMax;
      const valueCondition = {
        OR: [
          { avmValue: valueFilter },
          { assessedValue: valueFilter },
        ],
      };
      if (where.OR) {
        // search filter already uses OR, combine with AND to avoid clobbering
        const searchCondition = { OR: where.OR };
        delete where.OR;
        where.AND = [searchCondition, valueCondition];
      } else {
        where.OR = valueCondition.OR;
      }
    }

    const [homeowners, total] = await Promise.all([
      prisma.homeowner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.homeowner.count({ where }),
    ]);

    return {
      success: true,
      data: {
        homeowners,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  search_homeowners: async (input, context) => {
    // Resolve geoId from city if not provided
    let resolvedGeoId = input.geoId || '';
    if (!resolvedGeoId) {
      const geoResult = lookupGeoId(input.city);
      if (geoResult && !Array.isArray(geoResult)) {
        resolvedGeoId = geoResult.geoId;
      } else if (Array.isArray(geoResult) && geoResult.length > 0) {
        resolvedGeoId = geoResult[0].geoId;
      }
    }

    if (!resolvedGeoId) {
      return {
        success: false,
        error: `Could not resolve a GeoID for "${input.city}". Please provide a geoId or zip code directly.`,
        code: 'VALIDATION' as ToolErrorCode,
      };
    }

    // Parse date ranges from input
    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - 1); // default: 1 year back

    if (input.dateRanges && input.dateRanges.length > 0) {
      // Find the widest range from the provided dateRanges
      let maxYearsBack = 1;
      let minYearsBack = 0;

      for (const range of input.dateRanges) {
        const rangeStr = (range as string).toLowerCase().replace(/\s+/g, '');
        // Parse "5-7years" -> 5 to 7 years back
        const rangeMatch = rangeStr.match(/^(\d+)-(\d+)year/);
        if (rangeMatch) {
          const lo = parseInt(rangeMatch[1], 10);
          const hi = parseInt(rangeMatch[2], 10);
          if (hi > maxYearsBack) maxYearsBack = hi;
          if (lo > minYearsBack) minYearsBack = lo;
          continue;
        }
        // Parse "1year", "2years" -> N years back
        const singleMatch = rangeStr.match(/^(\d+)year/);
        if (singleMatch) {
          const n = parseInt(singleMatch[1], 10);
          if (n > maxYearsBack) maxYearsBack = n;
          continue;
        }
      }

      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - maxYearsBack);
      if (minYearsBack > 0) {
        endDate = new Date(now);
        endDate.setFullYear(endDate.getFullYear() - minYearsBack);
      }
    }

    const tags = input.permitTypes.join(',');

    // Create a permitSearch record for tracking
    const search = await prisma.permitSearch.create({
      data: {
        permitType: input.permitTypes.join(','),
        city: input.city,
        geoId: resolvedGeoId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'PENDING',
        conversationId: context?.conversationId || null,
      },
    });

    // Cross-trade signal mapping
    const CROSS_TRADE_MAP: Record<string, string[]> = {
      pool: ['solar', 'electrical'],
      ev_charger: ['solar', 'electrical'],
      adu: ['solar', 'hvac', 'electrical', 'roofing'],
      new_construction: ['solar', 'hvac', 'electrical', 'roofing', 'pool_spa', 'general_contractor'],
      roof_replacement: ['solar'],
      hvac_12plus: ['solar'],
      generator: ['electrical', 'solar'],
    };

    // Property value range parser
    const parsePropertyValueRange = (rangeStr: string): { min?: number; max?: number } | null => {
      if (!rangeStr || rangeStr === 'any') return null;
      const s = rangeStr.toLowerCase().replace(/\s+/g, '');
      // "1m+" or "1m"
      const mPlusMatch = s.match(/^(\d+(?:\.\d+)?)m\+?$/);
      if (mPlusMatch) return { min: parseFloat(mPlusMatch[1]) * 1_000_000 };
      // "under_400k"
      const underMatch = s.match(/^under[_-]?(\d+)k$/);
      if (underMatch) return { max: parseInt(underMatch[1], 10) * 1000 };
      // "400k-700k"
      const rangeMatch = s.match(/^(\d+)k-(\d+)k$/);
      if (rangeMatch) return { min: parseInt(rangeMatch[1], 10) * 1000, max: parseInt(rangeMatch[2], 10) * 1000 };
      // "400k+"
      const kPlusMatch = s.match(/^(\d+)k\+$/);
      if (kPlusMatch) return { min: parseInt(kPlusMatch[1], 10) * 1000 };
      return null;
    };

    const runSearch = async () => {
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'SEARCHING' },
      });

      const emitProgress = (event: any) => {
        if (search.conversationId) {
          emitJobToConversation(search.conversationId, WSEventType.JOB_PROGRESS, {
            jobId: search.id,
            jobType: 'homeowner:search',
            status: 'progress',
            result: event,
          });
        }
      };

      const maxResults = Math.min(input.maxResults || 250, 1000);

      emitProgress({ phase: 'searching', message: `Searching for homeowners in ${input.city}...` });

      let residents: any[] = [];
      try {
        const result = await shovelsClient.getResidents(resolvedGeoId, {
          tags,
          size: 50,
          maxResults,
        });
        residents = result.residents;
      } catch (err: any) {
        logger.warn({ err: err.message, geoId: resolvedGeoId }, 'Shovels getResidents failed, trying fallback');
      }

      // If primary search returned 0, try fallback via homeownerScraperService
      if (residents.length === 0) {
        emitProgress({ phase: 'fallback', message: 'Primary search returned 0 results, trying alternative approach...' });
        try {
          const fallbackResult = await homeownerScraperService.scrapeByGeoId(resolvedGeoId, input.city, maxResults);
          // Fallback imports homeowners directly into DB; query them back
          if (fallbackResult.totalImported > 0) {
            const imported = await prisma.homeowner.findMany({
              where: { city: { equals: input.city, mode: 'insensitive' } },
              orderBy: { createdAt: 'desc' },
              take: maxResults,
            });
            residents = imported;
          }
        } catch (fallbackErr: any) {
          logger.error({ err: fallbackErr.message, geoId: resolvedGeoId }, 'Homeowner scraper fallback failed');
        }
      }

      emitProgress({
        phase: 'processing',
        message: `Found ${residents.length} homeowners, processing signals...`,
      });

      // Count cross-trade signals from the results
      const crossTradeSignals: Record<string, number> = {};
      for (const resident of residents) {
        const permitTypes: string[] = resident.permitType
          ? resident.permitType.split(',').map((t: string) => t.trim().toLowerCase())
          : [];
        for (const pt of permitTypes) {
          const interestedTrades = CROSS_TRADE_MAP[pt];
          if (interestedTrades) {
            for (const trade of interestedTrades) {
              crossTradeSignals[trade] = (crossTradeSignals[trade] || 0) + 1;
            }
          }
        }
      }

      // Property value filtering (post-search)
      let filtered = residents;
      const valueRange = parsePropertyValueRange(input.propertyValueRange);
      if (valueRange) {
        filtered = residents.filter((r: any) => {
          const value = r.avmValue || r.assessedValue || r.propertyValue;
          if (value == null) return false;
          if (valueRange.min && value < valueRange.min) return false;
          if (valueRange.max && value > valueRange.max) return false;
          return true;
        });
      }

      // Update search record
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'COMPLETED', totalFound: filtered.length },
      });

      // Emit completion
      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_COMPLETED, {
          jobId: search.id,
          jobType: 'homeowner:search',
          status: 'completed',
          result: {
            total: filtered.length,
            withEmail: filtered.filter((r: any) => r.email).length,
            withPhone: filtered.filter((r: any) => r.phone).length,
            crossTradeSignals,
            trade: input.trade,
            city: input.city,
          },
        });
      }

      realtimeEmitter.emitJobEvent({
        jobId: search.id,
        jobType: 'homeowner:search',
        status: 'completed',
        result: { total: filtered.length, trade: input.trade, city: input.city },
      });
    };

    // Emit started events
    realtimeEmitter.emitJobEvent({
      jobId: search.id,
      jobType: 'homeowner:search',
      status: 'started',
    });

    if (context?.conversationId) {
      emitJobToConversation(context.conversationId, WSEventType.JOB_STARTED, {
        jobId: search.id,
        jobType: 'homeowner:search',
        status: 'started',
        result: { trade: input.trade, city: input.city, permitTypes: input.permitTypes },
      });
    }

    // Fire and forget
    runSearch().catch(async (err) => {
      logger.error({ err: err.message, searchId: search.id }, 'Homeowner search failed');
      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'FAILED' },
      }).catch(() => {});
      if (context?.conversationId) {
        emitJobToConversation(context.conversationId, WSEventType.JOB_FAILED, {
          jobId: search.id,
          jobType: 'homeowner:search',
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
        message: `Homeowner search for ${input.trade} trade in ${input.city} has been started (permit types: ${input.permitTypes.join(', ')}). Results will arrive via real-time notifications.`,
      },
    };
  },

  update_conversation_title: async (input, context) => {
    if (!context?.conversationId) {
      return { success: false, error: 'No conversation context available', code: 'PRECONDITION' as ToolErrorCode };
    }
    await prisma.conversation.update({
      where: { id: context.conversationId },
      data: { title: input.title },
    });
    return { success: true, data: { message: `Conversation title updated to "${input.title}"` } };
  },

  delete_homeowner: async (input) => {
    const homeowner = await prisma.homeowner.findUnique({
      where: { id: input.homeownerId },
      select: { id: true, fullName: true, email: true },
    });
    if (!homeowner) {
      return { success: false, error: `Homeowner not found with ID: ${input.homeownerId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    await prisma.homeowner.delete({ where: { id: input.homeownerId } });

    return {
      success: true,
      data: {
        message: `Homeowner ${homeowner.fullName || homeowner.email || input.homeownerId} deleted successfully.`,
      },
    };
  },

  enrich_homeowners: async (input) => {
    const batchSize = input.batchSize || 50;
    const enrichResult = await realieEnrichmentService.enrichPendingHomeowners(batchSize);

    return {
      success: true,
      data: {
        total: enrichResult.total,
        enriched: enrichResult.enriched,
        notFound: enrichResult.notFound,
        errors: enrichResult.errors,
        message: `Enriched ${enrichResult.enriched} of ${enrichResult.total} homeowners. ${enrichResult.notFound} not found, ${enrichResult.errors} errors.`,
      },
    };
  },

  enrich_homeowner_contacts: async (input) => {
    const contactBatchSize = input.batchSize || 50;
    const contactEnrichResult = await shovelsHomeownerEnrichmentService.enrichPendingHomeowners(contactBatchSize);

    return {
      success: true,
      data: {
        total: contactEnrichResult.total,
        enriched: contactEnrichResult.enriched,
        notFound: contactEnrichResult.notFound,
        noAddressId: contactEnrichResult.noAddressId,
        errors: contactEnrichResult.errors,
        message: `Contact enrichment complete: ${contactEnrichResult.enriched} of ${contactEnrichResult.total} homeowners got email/phone. ${contactEnrichResult.notFound} had no contact data in Shovels, ${contactEnrichResult.noAddressId} had no address ID, ${contactEnrichResult.errors} errors.`,
      },
    };
  },

  list_connections: async (input) => {
    const connResult = await connectionService.list({
      search: input.search,
      permitType: input.permitType,
      city: input.city,
      state: input.state,
      page: input.page || 1,
      limit: input.limit || 25,
    });

    return {
      success: true,
      data: {
        connections: connResult.data,
        pagination: connResult.pagination,
      },
    };
  },

  resolve_connections: async (input) => {
    const resolveResult = await connectionService.resolveConnections(
      input.batchSize || 50
    );

    return {
      success: true,
      data: {
        total: resolveResult.total,
        connected: resolveResult.connected,
        noContractor: resolveResult.noContractor,
        errors: resolveResult.errors,
        durationMs: resolveResult.duration,
        message: `Processed ${resolveResult.total} homeowners: ${resolveResult.connected} connected, ${resolveResult.noContractor} no contractor found, ${resolveResult.errors} errors.`,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}
