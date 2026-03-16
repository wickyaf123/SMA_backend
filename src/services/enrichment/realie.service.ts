import { realieClient } from '../../integrations/realie/client';
import type { RealieProperty } from '../../integrations/realie/types';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface RealieEnrichResult {
  total: number;
  enriched: number;
  notFound: number;
  errors: number;
}

export class RealieEnrichmentService {
  async enrichPendingHomeowners(batchSize: number = 50): Promise<RealieEnrichResult> {
    const pending = await prisma.homeowner.findMany({
      where: { realieEnriched: false, state: { not: null } },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    const result: RealieEnrichResult = { total: pending.length, enriched: 0, notFound: 0, errors: 0 };

    logger.info({ total: pending.length }, 'Starting Realie enrichment for homeowners');

    for (const homeowner of pending) {
      try {
        let property: RealieProperty | null = null;

        if (homeowner.street && homeowner.state) {
          property = await realieClient.lookupByAddress({
            state: homeowner.state,
            address: homeowner.street,
            city: homeowner.city || undefined,
            county: homeowner.county || undefined,
          });
        }

        if (!property && homeowner.lastName && homeowner.state) {
          const properties = await realieClient.searchByOwner({
            state: homeowner.state,
            lastName: homeowner.lastName,
            firstName: homeowner.firstName || undefined,
            limit: 1,
          });
          property = properties[0] || null;
        }

        if (property) {
          await prisma.homeowner.update({
            where: { id: homeowner.id },
            data: {
              realieEnriched: true,
              realieEnrichedAt: new Date(),
              assessedValue: property.totalAssessedValue ?? null,
              taxAmount: property.taxValue ?? null,
              avmValue: property.modelValue ?? null,
              avmMin: property.modelValueMin ?? null,
              avmMax: property.modelValueMax ?? null,
              ownerName: property.ownerName ?? null,
              totalBedrooms: property.totalBedrooms ?? null,
              totalBathrooms: property.totalBathrooms ?? null,
              buildingArea: property.buildingArea ?? null,
              stories: property.stories ?? null,
              hasPool: property.hasPool ?? null,
              hasGarage: property.hasGarage ?? null,
              garageCount: property.garageCount ?? null,
              fireplaceCount: property.fireplaceCount ?? null,
              constructionType: property.constructionType ?? null,
              roofType: property.roofType ?? null,
              foundationType: property.foundationType ?? null,
              lienCount: property.totalLienCount ?? null,
              lienBalance: property.totalLienBalance ?? null,
              equityEstimate: property.equityCurrentEstimateBalance ?? null,
              loanToValue: property.ltvCurrentEstimate ?? null,
              lastTransferDate: property.transferDate ?? null,
              lastTransferPrice: property.transferPrice ?? null,
              latitude: property.latitude ?? null,
              longitude: property.longitude ?? null,
              realieRawData: property as any,
              dataSources: { push: 'REALIE' },
            },
          });
          result.enriched++;
        } else {
          await prisma.homeowner.update({
            where: { id: homeowner.id },
            data: { realieEnriched: true, realieEnrichedAt: new Date() },
          });
          result.notFound++;
        }

        // Rate limiting: 200ms between calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err: any) {
        logger.warn({ homeownerId: homeowner.id, error: err.message }, 'Realie enrichment failed for homeowner');
        result.errors++;
      }
    }

    logger.info(result, 'Realie enrichment batch complete');
    return result;
  }
}

export const realieEnrichmentService = new RealieEnrichmentService();
