import { shovelsClient, ShovelsCreditLimitError } from '../../integrations/shovels/client';
import type { ShovelsResident } from '../../integrations/shovels/types';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface ShovelsContactEnrichResult {
  total: number;
  enriched: number;
  notFound: number;
  noAddressId: number;
  errors: number;
}

/**
 * Matches a Shovels resident to a homeowner by comparing names.
 * Returns the best-matching resident or null.
 */
function findMatchingResident(
  residents: ShovelsResident[],
  firstName: string | null,
  lastName: string | null,
  fullName: string | null
): ShovelsResident | null {
  if (residents.length === 0) return null;

  const normalize = (s: string | null) => (s || '').toLowerCase().trim();
  const ownerFirst = normalize(firstName);
  const ownerLast = normalize(lastName);
  const ownerFull = normalize(fullName);

  // Try exact last name + first name match
  for (const r of residents) {
    const rFirst = normalize(r.first_name);
    const rLast = normalize(r.last_name);
    if (ownerLast && rLast === ownerLast && ownerFirst && rFirst === ownerFirst) {
      return r;
    }
  }

  // Try last name match only
  for (const r of residents) {
    const rLast = normalize(r.last_name);
    if (ownerLast && rLast === ownerLast) {
      return r;
    }
  }

  // Try full name contains match
  for (const r of residents) {
    const rFull = normalize(r.name);
    if (ownerFull && rFull && (rFull.includes(ownerFull) || ownerFull.includes(rFull))) {
      return r;
    }
  }

  // If only one resident at the address, use them
  if (residents.length === 1) {
    return residents[0];
  }

  return null;
}

export class ShovelsHomeownerEnrichmentService {
  async enrichPendingHomeowners(batchSize: number = 50): Promise<ShovelsContactEnrichResult> {
    const pending = await prisma.homeowner.findMany({
      where: {
        shovelsContactEnriched: false,
        email: null,
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    const result: ShovelsContactEnrichResult = {
      total: pending.length,
      enriched: 0,
      notFound: 0,
      noAddressId: 0,
      errors: 0,
    };

    logger.info({ total: pending.length }, 'Starting Shovels contact enrichment for homeowners');

    for (const homeowner of pending) {
      try {
        // Get the address_id from the homeowner's first permit
        let addressId: string | null = null;

        if (homeowner.permitIds.length > 0) {
          const permit = await shovelsClient.getPermitById(homeowner.permitIds[0]);
          addressId = permit?.address?.address_id || null;
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (!addressId) {
          // Mark as processed so we don't retry
          await prisma.homeowner.update({
            where: { id: homeowner.id },
            data: {
              shovelsContactEnriched: true,
              shovelsContactEnrichedAt: new Date(),
            },
          });
          result.noAddressId++;
          continue;
        }

        // Fetch residents at this address
        const residents = await shovelsClient.getResidentsByAddress(addressId);

        // Find the matching resident by name
        const matched = findMatchingResident(
          residents,
          homeowner.firstName,
          homeowner.lastName,
          homeowner.fullName
        );

        if (matched && (matched.email || matched.phone)) {
          await prisma.homeowner.update({
            where: { id: homeowner.id },
            data: {
              shovelsContactEnriched: true,
              shovelsContactEnrichedAt: new Date(),
              email: matched.email || homeowner.email,
              phone: matched.phone || homeowner.phone,
              gender: matched.gender || homeowner.gender,
              ageRange: matched.age_range || homeowner.ageRange,
              isMarried: matched.is_married ?? homeowner.isMarried,
              hasChildren: matched.has_children ?? homeowner.hasChildren,
              incomeRange: matched.income_range || homeowner.incomeRange,
              netWorth: matched.net_worth || homeowner.netWorth,
              education: matched.education || homeowner.education,
              dataSources: { push: 'SHOVELS_CONTACT' },
            },
          });
          result.enriched++;
        } else {
          // Mark as processed even if no contact data found
          await prisma.homeowner.update({
            where: { id: homeowner.id },
            data: {
              shovelsContactEnriched: true,
              shovelsContactEnrichedAt: new Date(),
            },
          });
          result.notFound++;
        }

        // Rate limiting: 200ms between calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err: any) {
        if (err instanceof ShovelsCreditLimitError) {
          logger.warn('Shovels contact enrichment stopped — daily credit limit hit');
          break;
        }
        logger.warn(
          { homeownerId: homeowner.id, error: err.message },
          'Shovels contact enrichment failed for homeowner'
        );
        result.errors++;
      }
    }

    logger.info(result, 'Shovels contact enrichment batch complete');
    return result;
  }
}

export const shovelsHomeownerEnrichmentService = new ShovelsHomeownerEnrichmentService();
