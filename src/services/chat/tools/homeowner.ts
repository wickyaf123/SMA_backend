import { ToolDefinition, ToolHandler, ToolRegistry, ToolContext, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { realieEnrichmentService } from '../../enrichment/realie.service';
import { shovelsHomeownerEnrichmentService } from '../../enrichment/shovels-homeowner.service';
import { connectionService } from '../../connection/connection.service';
import { shovelsClient } from '../../../integrations/shovels/client';
import {
  lookupGeoId,
  getShovelsGeoIdsForCity,
  getZipsForCounty,
  getZipsForState,
} from '../../../data/geo-ids';
import { homeownerScraperService } from '../../scraper/homeowner.service';
import { emitJobToConversation, WSEventType } from '../../../config/websocket';
import { realtimeEmitter } from '../../realtime/event-emitter.service';
import { jobLogService } from '../../job-log.service';
import { logger } from '../../../utils/logger';

/** Returns a Date that is `years` whole years before `from`. */
function yearsAgoDate(from: Date, years: number): Date {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

/** Parses "400k-700k" / "under_400k" / "1m+" / "any" into an inclusive {min,max} range. */
function parsePropertyValueRange(rangeStr: string): { min?: number; max?: number } | null {
  if (!rangeStr || rangeStr === 'any') return null;
  const s = rangeStr.toLowerCase().replace(/\s+/g, '');
  const mPlusMatch = s.match(/^(\d+(?:\.\d+)?)m\+?$/);
  if (mPlusMatch) return { min: parseFloat(mPlusMatch[1]) * 1_000_000 };
  const underMatch = s.match(/^under[_-]?(\d+)k$/);
  if (underMatch) return { max: parseInt(underMatch[1], 10) * 1000 };
  const rangeMatch = s.match(/^(\d+)k-(\d+)k$/);
  if (rangeMatch) return { min: parseInt(rangeMatch[1], 10) * 1000, max: parseInt(rangeMatch[2], 10) * 1000 };
  const kPlusMatch = s.match(/^(\d+)k\+$/);
  if (kPlusMatch) return { min: parseInt(kPlusMatch[1], 10) * 1000 };
  return null;
}

/**
 * Tag-matching: Shovels' `/permits/search` does NOT accept `tags=` so we
 * filter client-side. We match permit `type`, `subtype`, `description`,
 * and `tags[]` loosely — a user-supplied "roofing" matches "Re-roof", and
 * "ADU" matches "accessory dwelling unit".
 *
 * The synonym table is intentionally small and trade-focused; if a
 * user-supplied token is not in the map we just substring-match it.
 */
const TAG_SYNONYMS: Record<string, string[]> = {
  roofing: ['roof', 're-roof', 'reroof', 'shingle', 'roofing'],
  solar: ['solar', 'pv', 'photovoltaic'],
  adu: ['adu', 'accessory dwelling', 'guest house', 'casita'],
  hvac: ['hvac', 'heat', 'air condition', 'a/c', 'furnace', 'heat pump', 'mechanical'],
  electrical: ['electric', 'panel upgrade', 'service upgrade'],
  pool: ['pool', 'spa'],
  pool_spa: ['pool', 'spa'],
  ev_charger: ['ev', 'charger', 'charging'],
  storm: ['storm', 'wind damage', 'hail'],
  storm_damage: ['storm', 'wind damage', 'hail', 'damage'],
  generator: ['generator', 'standby power'],
  hvac_12plus: ['hvac', 'heat', 'air condition', 'mechanical'],
  roof_replacement: ['roof', 're-roof', 'reroof', 'replace'],
  home_additions: ['addition', 'remodel', 'alteration', 'expand'],
  additions: ['addition', 'remodel', 'alteration', 'expand'],
  new_construction: ['new construction', 'new residential', 'new commercial', 'building permit'],
};

function expandTagSynonyms(tagsCsv: string): string[] {
  const tokens = tagsCsv
    .toLowerCase()
    .split(',')
    .map((t) => t.trim().replace(/\s+/g, '_'))
    .filter(Boolean);
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t.replace(/_/g, ' '));
    if (TAG_SYNONYMS[t]) for (const syn of TAG_SYNONYMS[t]) out.add(syn);
  }
  return Array.from(out);
}

function permitMatchesTags(permit: any, tagsCsv: string): boolean {
  if (!tagsCsv) return true;
  const wanted = expandTagSynonyms(tagsCsv);
  if (wanted.length === 0) return true;
  const haystack = [
    permit?.type,
    permit?.subtype,
    permit?.description,
    ...(Array.isArray(permit?.tags) ? permit.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return wanted.some((t) => haystack.includes(t));
}

/**
 * Run a single widening tier. The right Shovels pipeline for homeowner
 * discovery is:
 *   /permits/search?geo_id=ZIP   → permits (with geo_ids.address_id)
 *   /addresses/{address_id}/residents → people at that property
 *
 * Notes:
 * - `/addresses/{geoId}/residents` rejects ZIP codes ("Invalid geolocation
 *   ID type") and rejects FIPS codes ("Invalid geolocation ID value").
 *   Only Shovels' opaque address-level token works — discovered via curl
 *   2026-04-17.
 * - Many addresses have no resident records on file. We surface
 *   permit-only "lead" rows in that case so the user still gets a
 *   property-level prospect to enrich elsewhere (Realie, GHL, manual).
 * - We cap aggressively to control Shovels credit usage: per-tier ZIP
 *   cap, per-ZIP permit cap, and total-result cap.
 */
async function runOneTier(
  tier: {
    zips: string[];
    tags: string;
    valueRange: string;
    startDate: Date;
    endDate: Date;
    zipCap: number;
  },
  maxResults: number
): Promise<any[]> {
  const collected: any[] = [];
  const seenAddress = new Set<string>();
  const valueRange = parsePropertyValueRange(tier.valueRange);
  const zipsToTry = tier.zips.slice(0, tier.zipCap);

  // Per-ZIP permit ceiling — each permit costs 1 search credit + up to 1
  // residents-lookup credit. Keep total <=~100 calls/tier.
  const permitsPerZip = Math.min(20, Math.max(maxResults * 2, 5));

  const fromDate = tier.startDate.toISOString().split('T')[0];
  const toDate = tier.endDate.toISOString().split('T')[0];

  for (const zip of zipsToTry) {
    if (collected.length >= maxResults) break;

    // 1) Get permits in this ZIP for the date window.
    let permits: any[] = [];
    try {
      permits = await shovelsClient.searchPermits(
        { geo_id: zip, permit_from: fromDate, permit_to: toDate, size: Math.min(permitsPerZip, 50) },
        permitsPerZip
      );
    } catch (err: any) {
      logger.warn({ err: err.message, zip }, 'Shovels permits/search failed for ZIP — skipping');
      continue;
    }

    // 2) Filter permits by tags (client-side — endpoint ignores tags param).
    const matchingPermits = permits.filter((p) => permitMatchesTags(p, tier.tags));

    // 3) For each matching permit, fetch residents at its address.
    //    Dedupe addresses so we don't hit the same one twice across permits.
    for (const permit of matchingPermits) {
      if (collected.length >= maxResults) break;

      const addressId: string | null = permit?.geo_ids?.address_id || null;
      if (!addressId) continue;
      if (seenAddress.has(addressId)) continue;
      seenAddress.add(addressId);

      let residents: any[] = [];
      try {
        residents = await shovelsClient.getResidentsByAddress(addressId);
      } catch (err: any) {
        logger.warn(
          { err: err.message, addressId, permitId: permit?.id },
          'Residents lookup failed — falling back to permit-only lead'
        );
      }

      const propValue = permit?.property_assess_market_value;
      const passesValueFilter =
        !valueRange ||
        (propValue != null &&
          (!valueRange.min || propValue >= valueRange.min) &&
          (!valueRange.max || propValue <= valueRange.max));

      if (residents.length > 0) {
        for (const r of residents) {
          if (!passesValueFilter) continue;
          collected.push({
            ...r,
            _permitContext: {
              type: permit?.type,
              subtype: permit?.subtype,
              issue_date: permit?.issue_date,
              file_date: permit?.file_date,
              tags: permit?.tags,
              address: permit?.address,
              property_value: propValue,
            },
          });
          if (collected.length >= maxResults) break;
        }
      } else {
        // No residents on file for this address — surface the permit as a
        // property-level lead so the user still has something actionable.
        if (passesValueFilter) {
          collected.push({
            id: `permit:${permit?.id}`,
            isPermitOnlyLead: true,
            address: permit?.address,
            property_value: propValue,
            permit: {
              id: permit?.id,
              number: permit?.number,
              type: permit?.type,
              subtype: permit?.subtype,
              issue_date: permit?.issue_date,
              file_date: permit?.file_date,
              tags: permit?.tags,
            },
          });
        }
      }
    }
  }

  return collected;
}

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
    // ── 1. Resolve city → list of valid Shovels geo_ids ─────────────
    // CRITICAL: Shovels does NOT accept FIPS county codes (e.g. "04013").
    // We use the city's ZIPs from our local dictionary; if the city isn't
    // there we fall back to Shovels' own `/addresses/search?q=...` resolver.
    let cityGeoIds: string[] = [];
    if (input.geoId) {
      cityGeoIds = [String(input.geoId)];
    } else if (input.city) {
      cityGeoIds = getShovelsGeoIdsForCity(input.city);
      if (cityGeoIds.length === 0) {
        const addrs = await shovelsClient.searchAddresses(input.city, 1).catch(() => []);
        if (addrs[0]?.geo_id) cityGeoIds = [addrs[0].geo_id];
      }
    }
    if (cityGeoIds.length === 0) {
      return {
        success: false,
        error: `Could not resolve any Shovels geo IDs for "${input.city}". Provide a geoId or 5-digit ZIP directly.`,
        code: 'VALIDATION' as ToolErrorCode,
      };
    }

    // For widening: derive county and statewide ZIP pools (no extra Shovels calls).
    const countyGeoIds: string[] = input.city
      ? getZipsForCounty(input.city).filter((z) => !cityGeoIds.includes(z))
      : [];
    const cityLookup = input.city ? lookupGeoId(input.city) : null;
    const stateAbbr =
      cityLookup && !Array.isArray(cityLookup)
        ? cityLookup.stateAbbr
        : Array.isArray(cityLookup)
          ? cityLookup[0]?.stateAbbr || ''
          : '';
    const stateGeoIds = stateAbbr ? getZipsForState(stateAbbr, 30) : [];

    // ── 2. Parse user date window ───────────────────────────────────
    const now = new Date();
    let userMaxYearsBack = 1;
    let userMinYearsBack = 0;
    if (input.dateRanges && input.dateRanges.length > 0) {
      for (const range of input.dateRanges) {
        const rangeStr = (range as string).toLowerCase().replace(/\s+/g, '');
        const rangeMatch = rangeStr.match(/^(\d+)-(\d+)year/);
        if (rangeMatch) {
          const lo = parseInt(rangeMatch[1], 10);
          const hi = parseInt(rangeMatch[2], 10);
          if (hi > userMaxYearsBack) userMaxYearsBack = hi;
          if (lo > userMinYearsBack) userMinYearsBack = lo;
          continue;
        }
        const singleMatch = rangeStr.match(/^(\d+)year/);
        if (singleMatch) {
          const n = parseInt(singleMatch[1], 10);
          if (n > userMaxYearsBack) userMaxYearsBack = n;
        }
      }
    }
    const userTags = input.permitTypes.join(',');
    const userValueRange = input.propertyValueRange || 'any';

    // ── 3. Create permit-search row + ImportJob row ─────────────────
    const search = await prisma.permitSearch.create({
      data: {
        permitType: userTags,
        city: input.city,
        geoId: cityGeoIds[0],
        startDate: yearsAgoDate(now, userMaxYearsBack),
        endDate: userMinYearsBack > 0 ? yearsAgoDate(now, userMinYearsBack) : new Date(now),
        status: 'PENDING',
        conversationId: context?.conversationId || null,
      },
    });

    let importJobId: string | null = null;
    try {
      importJobId = await jobLogService.startJob('HOMEOWNER_SCRAPE', {
        city: input.city,
        permitTypes: input.permitTypes,
        permitSearchId: search.id,
        conversationId: context?.conversationId,
        manual: true,
        triggeredFrom: 'chat',
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to create ImportJob row for homeowner search — continuing');
    }

    // ── 4. Background search (fire-and-forget) ──────────────────────
    const runSearch = async () => {
      await prisma.permitSearch.update({ where: { id: search.id }, data: { status: 'SEARCHING' } });

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

      // Build tier ladder. Each tier yields a "candidate" search definition.
      // Stop at first tier returning ≥ 1 hit.
      type Tier = {
        id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
        zips: string[];
        tags: string;
        valueRange: string;
        startDate: Date;
        endDate: Date;
        zipCap: number;
        reason: string;
      };

      // Tier ladder: peel off filters in order of "least likely to be present"
      // in Shovels data. Property values are null for ~95% of permits in our
      // sampling, so we drop value before tags. Tags are loosely matched
      // (synonym-expanded), so we drop them only after value.
      const tiers: Tier[] = [
        {
          id: 'A' as const,
          zips: cityGeoIds,
          tags: userTags,
          valueRange: userValueRange,
          startDate: yearsAgoDate(now, userMaxYearsBack),
          endDate: userMinYearsBack > 0 ? yearsAgoDate(now, userMinYearsBack) : new Date(now),
          zipCap: 5,
          reason: 'Strict — your exact filters in the requested city.',
        },
        {
          id: 'B' as const,
          zips: cityGeoIds,
          tags: userTags,
          valueRange: 'any',
          startDate: yearsAgoDate(now, userMaxYearsBack),
          endDate: new Date(now),
          zipCap: 5,
          reason:
            userValueRange && userValueRange !== 'any'
              ? `No matches at property-value range ${userValueRange} (Shovels rarely populates property values) — dropped value filter.`
              : 'Widened the date window to current.',
        },
        {
          id: 'C' as const,
          zips: cityGeoIds,
          tags: '',
          valueRange: 'any',
          startDate: yearsAgoDate(now, userMaxYearsBack),
          endDate: new Date(now),
          zipCap: 5,
          reason: 'No matches with your permit-type filter — searched the city for any permit type.',
        },
        {
          id: 'D' as const,
          zips: cityGeoIds,
          tags: '',
          valueRange: 'any',
          startDate: yearsAgoDate(now, Math.max(userMaxYearsBack * 2, userMaxYearsBack + 2)),
          endDate: new Date(now),
          zipCap: 5,
          reason: `No matches in the ${userMaxYearsBack}-year window — widened to ${Math.max(userMaxYearsBack * 2, userMaxYearsBack + 2)} years.`,
        },
        {
          id: 'E' as const,
          zips: countyGeoIds,
          tags: userTags,
          valueRange: 'any',
          startDate: yearsAgoDate(now, userMaxYearsBack),
          endDate: new Date(now),
          zipCap: 8,
          reason: 'No matches in the requested city — searched neighboring cities in the same county for your permit types.',
        },
        {
          id: 'F' as const,
          zips: stateGeoIds,
          tags: '',
          valueRange: 'any',
          startDate: yearsAgoDate(now, userMaxYearsBack),
          endDate: new Date(now),
          zipCap: 10,
          reason: `Last resort — searched statewide (${stateAbbr || 'state'}) for any recent permit.`,
        },
      ].filter((t) => t.zips.length > 0);

      let appliedTier: Tier | null = null;
      let residents: any[] = [];

      for (const tier of tiers) {
        emitProgress({
          phase: 'searching',
          message: `Tier ${tier.id} (${tier.zips.length} ZIP${tier.zips.length === 1 ? '' : 's'}): ${tier.reason}`,
          tier: tier.id,
        });
        residents = await runOneTier(tier, maxResults);
        if (residents.length >= 1) {
          appliedTier = tier;
          break;
        }
      }

      // ── 5. DB-fallback if every Shovels tier missed ───────────────
      // Last-ditch: invoke the existing scraper which writes Homeowner rows
      // directly and we query them back. Same code path the old impl used.
      if (residents.length === 0) {
        emitProgress({
          phase: 'fallback',
          message: 'No matches in any Shovels tier — falling back to local scraper (Realie / DB).',
        });
        try {
          const fallbackResult = await homeownerScraperService.scrapeByGeoId(
            cityGeoIds[0],
            input.city,
            maxResults
          );
          if (fallbackResult.totalImported > 0) {
            residents = await prisma.homeowner.findMany({
              where: { city: { equals: input.city, mode: 'insensitive' } },
              orderBy: { createdAt: 'desc' },
              take: maxResults,
            });
            appliedTier = {
              id: 'F' as const,
              zips: cityGeoIds,
              tags: userTags,
              valueRange: 'any',
              startDate: yearsAgoDate(now, userMaxYearsBack),
              endDate: new Date(now),
              zipCap: 5,
              reason: 'Shovels returned no matches — surfaced homeowners imported by our local scraper.',
            };
          }
        } catch (fallbackErr: any) {
          logger.error({ err: fallbackErr.message }, 'Homeowner DB-fallback failed');
          try {
            const { logIssue } = await import('../../../services/observability/issue-log.service');
            void logIssue({
              category: 'HOMEOWNER_FALLBACK_FAILED',
              severity: 'ERROR',
              message: `Homeowner DB-fallback failed: ${fallbackErr?.message ?? 'unknown'}`,
              conversationId: context?.conversationId ?? null,
              jobId: search?.id ?? null,
              payload: {
                city: input.city,
                permitTypes: input.permitTypes,
                error: fallbackErr?.message ?? String(fallbackErr),
              },
            });
          } catch {
            // logIssue should never block the fallback path
          }
        }
      }

      // ── 6. Cross-trade signal counting + final result ─────────────
      const CROSS_TRADE_MAP: Record<string, string[]> = {
        pool: ['solar', 'electrical'],
        ev_charger: ['solar', 'electrical'],
        adu: ['solar', 'hvac', 'electrical', 'roofing'],
        new_construction: ['solar', 'hvac', 'electrical', 'roofing', 'pool_spa', 'general_contractor'],
        roof_replacement: ['solar'],
        hvac_12plus: ['solar'],
        generator: ['electrical', 'solar'],
      };
      const crossTradeSignals: Record<string, number> = {};
      for (const resident of residents) {
        const permitTypes: string[] = resident.permitType
          ? String(resident.permitType).split(',').map((t: string) => t.trim().toLowerCase())
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

      const widening = appliedTier
        ? {
            appliedTier: appliedTier.id,
            wasWidened: appliedTier.id !== 'A',
            originalQuery: {
              city: input.city,
              permitTypes: input.permitTypes,
              propertyValueRange: userValueRange,
              yearsBack: userMaxYearsBack,
            },
            actualQuery: {
              cityZipsTried: appliedTier.zips.slice(0, appliedTier.zipCap),
              tags: appliedTier.tags || '(any)',
              propertyValueRange: appliedTier.valueRange,
              yearsBack: Math.round(
                (appliedTier.endDate.getTime() - appliedTier.startDate.getTime()) /
                  (365 * 24 * 60 * 60 * 1000)
              ),
            },
            reason: appliedTier.reason,
          }
        : {
            appliedTier: null,
            wasWidened: false,
            originalQuery: {
              city: input.city,
              permitTypes: input.permitTypes,
              propertyValueRange: userValueRange,
              yearsBack: userMaxYearsBack,
            },
            reason: 'No homeowners found in any tier (city → no-tag → any-value → wider window → county → statewide → DB).',
          };

      await prisma.permitSearch.update({
        where: { id: search.id },
        data: { status: 'COMPLETED', totalFound: residents.length },
      });

      if (importJobId) {
        await jobLogService
          .completeJob(importJobId, {
            totalRecords: residents.length,
            successCount: residents.length,
            errorCount: 0,
            metadata: { widening },
          })
          .catch((e) => logger.warn({ err: e.message }, 'completeJob failed'));
      }

      // Build a sample of leads for the in-chat table (first 10).
      // Includes both real residents and permit-only "leads needing enrichment".
      const sampleHomeowners = residents.slice(0, 10).map((r: any) => {
        const addr = r.address || r._permitContext?.address || null;
        const street = addr
          ? [addr.street_no, addr.street].filter(Boolean).join(' ') || addr.street || ''
          : [r.street_no, r.street].filter(Boolean).join(' ') || r.street || '';
        const permit = r.permit || r._permitContext || null;
        return {
          id: r.id || null,
          name: r.fullName || r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || (r.isPermitOnlyLead ? '— (no resident on file)' : ''),
          email: r.email || null,
          phone: r.phone || null,
          street: street || null,
          city: r.city || addr?.city || null,
          state: r.state || addr?.state || null,
          zipCode: r.zip_code || r.zipCode || addr?.zip_code || null,
          permitType: permit?.type || permit?.subtype || null,
          permitDate: permit?.issue_date || permit?.file_date || null,
          propertyValue: r.property_value || r._permitContext?.property_value || r.avmValue || r.assessedValue || null,
          isPermitOnlyLead: !!r.isPermitOnlyLead,
        };
      });

      // Funnel diagnostics so the user can see WHY a 0-result search failed
      // (e.g. "Shovels had 8 properties, 0 matched tag filter" or "All tiers
      // exhausted — no data in Miami for 2019-2021"). Mirrors the structure
      // we use for contractor searches.
      //
      // dataSource tells the UI whether these records came from a fresh
      // Shovels API scrape (Tiers A-E) or a DB fallback (Tier F — rare).
      // Prevents the "did we actually scrape?" ambiguity the user flagged.
      const dataSource: 'shovels_live' | 'db_fallback' | 'none' = !appliedTier
        ? 'none'
        : appliedTier.id === 'F' ? 'db_fallback' : 'shovels_live';

      const diagnostics = {
        totalFound: residents.length,
        permitOnlyCount: residents.filter((r: any) => r.isPermitOnlyLead).length,
        enrichedCount: residents.filter((r: any) => r.realieEnriched).length,
        appliedTier: appliedTier?.id ?? null,
        tiersTried: appliedTier?.id ?? 'A-F (all exhausted)',
        dataSource,
        reason: widening.reason,
        originalQuery: {
          city: input.city,
          permitTypes: input.permitTypes,
          propertyValueRange: userValueRange,
          yearsBack: userMaxYearsBack,
        },
      };

      const completedPayload = {
        total: residents.length,
        withEmail: residents.filter((r: any) => r.email).length,
        withPhone: residents.filter((r: any) => r.phone).length,
        permitOnlyCount: residents.filter((r: any) => r.isPermitOnlyLead).length,
        crossTradeSignals,
        trade: input.trade,
        city: input.city,
        widening,
        diagnostics,
        homeowners: sampleHomeowners,
      };

      if (search.conversationId) {
        emitJobToConversation(search.conversationId, WSEventType.JOB_COMPLETED, {
          jobId: search.id,
          jobType: 'homeowner:search',
          status: 'completed',
          result: completedPayload,
        });
      }
      realtimeEmitter.emitJobEvent({
        jobId: search.id,
        jobType: 'homeowner:search',
        status: 'completed',
        result: completedPayload,
      });
    };

    // Started events
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

    // Fire-and-forget
    runSearch().catch(async (err) => {
      logger.error({ err: err.message, searchId: search.id }, 'Homeowner search failed');
      await prisma.permitSearch
        .update({ where: { id: search.id }, data: { status: 'FAILED' } })
        .catch(() => {});
      if (importJobId) {
        await jobLogService
          .failJob(importJobId, err.message, { permitSearchId: search.id })
          .catch(() => {});
      }
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
        message:
          `Homeowner search for ${input.trade} in ${input.city} has started ` +
          `(permit types: ${input.permitTypes.join(', ')}). ` +
          `If your exact filters return nothing, the search will widen step-by-step ` +
          `(drop tag → any value → longer window → neighboring cities → statewide) and ` +
          `report which tier was used in the result. Results arrive via real-time notification.`,
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
    registry.register({ ...def, domain: 'permit' }, handlers[def.name]);
  }
}
