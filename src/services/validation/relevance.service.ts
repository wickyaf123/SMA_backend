/**
 * Permit-Type Relevance Validator
 *
 * Filters out contractors returned by Shovels that don't actually
 * belong to the searched permit-type industry.  e.g. an elevator
 * company that happened to pull one solar permit should not end up
 * in the solar pipeline.
 *
 * Signals used (strongest → weakest):
 *   1. tag_tally ratio – what share of the contractor's permits match the search tag
 *   2. business_name / primary_industry keyword mismatch
 *   3. classification fields
 */

import type { ShovelsContractor } from '../../integrations/shovels/types';
import { logger } from '../../utils/logger';

export interface RelevanceResult {
  relevant: boolean;
  score: number;            // 0–100
  reason: string | null;    // human-readable rejection reason
  tagRatio: number | null;  // 0–1, share of tag_tally for searched type
}

const TAG_RATIO_THRESHOLD = 0.10;
const SCORE_THRESHOLD = 25;

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  solar:      ['solar', 'photovoltaic', 'pv', 'renewable energy', 'battery installer'],
  hvac:       ['hvac', 'heating', 'air conditioning', 'cooling', 'furnace', 'heat pump'],
  roofing:    ['roof', 'roofing', 'shingle', 'gutter'],
  plumbing:   ['plumb', 'plumbing', 'pipe', 'drain', 'sewer', 'water heater'],
  electrical: ['electric', 'electrical', 'wiring', 'electrician', 'elec', 'power', 'lighting', 'panel'],
  elevator:   ['elevator', 'escalator', 'lift'],
  demolition: ['demolition', 'demo', 'wrecking'],
  painting:   ['paint', 'painting', 'coating'],
  landscaping:['landscape', 'landscaping', 'lawn', 'irrigation', 'tree'],
  concrete:   ['concrete', 'cement', 'masonry'],
  fencing:    ['fence', 'fencing'],
  pool:       ['pool', 'spa', 'swimming'],
  fire:       ['fire', 'sprinkler', 'fire alarm', 'fire protection'],
  general:    ['general contractor', 'general construction', 'remodel'],
};

// Utility / grid operators that commonly appear in solar / electrical permit
// feeds (interconnection paperwork) but are NOT installers. Hard-reject for
// solar and battery searches regardless of tag_tally.
const UTILITY_BLOCKLIST: string[] = [
  'florida power',
  'power & light',
  'light & power',
  'duke energy',
  'pacific gas',
  'pg&e',
  'pgne',
  'con edison',
  'consolidated edison',
  'national grid',
  'municipal utilities',
  'municipal utility',
  'electric cooperative',
  'electric co-op',
  'electric coop',
  'rural electric',
  'southern california edison',
  'xcel energy',
  'dominion energy',
  'ameren',
  'entergy',
  'nv energy',
  'eversource',
  'tva',
  'tennessee valley authority',
];

// Searches where utility-company contamination is common enough to warrant
// the hard blocklist above.
const UTILITY_SENSITIVE_TAGS = new Set(['solar', 'battery', 'electrical']);

/**
 * Score a contractor's relevance to the searched permit type.
 *
 * Returns { relevant, score, reason, tagRatio }.
 */
export function scoreContractorRelevance(
  contractor: ShovelsContractor,
  searchedPermitType: string,
): RelevanceResult {
  const searchTag = searchedPermitType.toLowerCase().trim();
  let score = 0;
  const reasons: string[] = [];

  // ── 0. Utility / grid-operator blocklist ───────────────────────
  // Hard-reject utilities when searching for install-type permits — FPL,
  // Duke, PG&E etc. routinely show up in solar feeds via interconnection
  // paperwork but are never the installer.
  const rawName = (contractor.business_name || contractor.name || '').toLowerCase();
  if (UTILITY_SENSITIVE_TAGS.has(searchTag)) {
    const blockedMatch = UTILITY_BLOCKLIST.find((kw) => rawName.includes(kw));
    if (blockedMatch) {
      return {
        relevant: false,
        score: 0,
        reason: `"${contractor.business_name || contractor.name}" matches utility blocklist ("${blockedMatch}") — not an installer`,
        tagRatio: null,
      };
    }
  }

  // ── 1. Tag-tally ratio (0-50 pts) ──────────────────────────────
  let tagRatio: number | null = null;

  if (contractor.tag_tally && Object.keys(contractor.tag_tally).length > 0) {
    const totalPermits = Object.values(contractor.tag_tally).reduce((a, b) => a + b, 0);
    const matchingPermits = findMatchingTagCount(contractor.tag_tally, searchTag);
    tagRatio = totalPermits > 0 ? matchingPermits / totalPermits : 0;

    if (tagRatio >= 0.5) {
      score += 50;
    } else if (tagRatio >= 0.25) {
      score += 35;
    } else if (tagRatio >= TAG_RATIO_THRESHOLD) {
      score += 20;
    } else {
      score += Math.round(tagRatio * 100);
      reasons.push(
        `tag_tally ratio ${(tagRatio * 100).toFixed(1)}% for "${searchTag}" (${matchingPermits}/${totalPermits} permits)`
      );
    }
  } else {
    score += 15;
  }

  // ── 2. Business name / primary_industry match (0-30 pts) ───────
  const name = (contractor.business_name || contractor.name || '').toLowerCase();
  const industry = (contractor.primary_industry || '').toLowerCase();
  const classification = [
    contractor.classification,
    contractor.classification_derived,
  ].filter(Boolean).join(' ').toLowerCase();

  const relevantKeywords = INDUSTRY_KEYWORDS[searchTag] || [searchTag];
  const nameMatchesSearchType = relevantKeywords.some(kw => name.includes(kw));
  const industryMatchesSearchType = relevantKeywords.some(
    kw => industry.includes(kw) || classification.includes(kw)
  );

  let mismatchedIndustry: string | null = null;
  if (nameMatchesSearchType) {
    score += 30;
  } else if (industryMatchesSearchType) {
    score += 25;
  } else {
    mismatchedIndustry = detectIndustryFromName(name, searchTag);
    if (mismatchedIndustry) {
      // Previously this branch silently awarded 0 pts to name and relied on
      // the classification bonus below to quietly push the contractor past
      // the threshold anyway (how FPL slipped through). For solar/battery
      // searches a detected cross-industry name is a strong negative signal;
      // actively penalize instead of staying neutral.
      if (UTILITY_SENSITIVE_TAGS.has(searchTag)) {
        score -= 25;
      }
      reasons.push(
        `business name "${contractor.business_name || contractor.name}" indicates "${mismatchedIndustry}", not "${searchTag}"`
      );
    } else {
      score += 10;
    }
  }

  // ── 3. Classification / SIC / NAICS bonus (0-20 pts) ──────────
  if (industryMatchesSearchType) {
    score += 20;
  } else if (contractor.primary_industry) {
    score += 5;
  } else {
    score += 10;
  }

  score = Math.min(100, Math.max(0, score));
  const relevant = score >= SCORE_THRESHOLD;
  const reason = relevant ? null : reasons.join('; ') || `low relevance score (${score})`;

  if (!relevant) {
    logger.debug(
      { contractorId: contractor.id, name: contractor.business_name, score, tagRatio, reason },
      'Contractor failed relevance check'
    );
  }

  return { relevant, score, reason, tagRatio };
}

/**
 * Look up how many permits in tag_tally match the searched type.
 * Handles fuzzy matching (e.g. "solar" matches "solar_residential", "solar_commercial").
 */
function findMatchingTagCount(tagTally: Record<string, number>, searchTag: string): number {
  const searchTerms = INDUSTRY_KEYWORDS[searchTag] || [searchTag];
  let total = 0;
  for (const [tag, count] of Object.entries(tagTally)) {
    const normalizedTag = tag.toLowerCase().replace(/[_-]/g, ' ');
    const matched = searchTerms.some(term =>
      normalizedTag === term || normalizedTag.includes(term) || term.includes(normalizedTag)
    );
    if (matched) {
      total += count;
    }
  }
  return total;
}

/**
 * Detect if a business name clearly belongs to a *different* industry.
 * Returns the detected mismatched industry name, or null if no clear mismatch.
 */
function detectIndustryFromName(name: string, searchTag: string): string | null {
  for (const [industryKey, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (industryKey === searchTag) continue;
    if (keywords.some(kw => name.includes(kw))) {
      return industryKey;
    }
  }
  return null;
}

/**
 * Batch-filter contractors, returning only relevant ones.
 */
export function filterRelevantContractors(
  contractors: ShovelsContractor[],
  searchedPermitType: string,
): { relevant: ShovelsContractor[]; rejected: Array<{ contractor: ShovelsContractor; result: RelevanceResult }> } {
  const relevant: ShovelsContractor[] = [];
  const rejected: Array<{ contractor: ShovelsContractor; result: RelevanceResult }> = [];

  for (const contractor of contractors) {
    const result = scoreContractorRelevance(contractor, searchedPermitType);
    if (result.relevant) {
      relevant.push(contractor);
    } else {
      rejected.push({ contractor, result });
    }
  }

  if (rejected.length > 0) {
    logger.info(
      {
        searchedPermitType,
        total: contractors.length,
        relevant: relevant.length,
        rejected: rejected.length,
        rejectedNames: rejected.slice(0, 10).map(r => r.contractor.business_name || r.contractor.name),
      },
      'Relevance filter applied to Shovels contractors'
    );
  }

  return { relevant, rejected };
}
