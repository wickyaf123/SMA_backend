import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface FillRateField {
  field: string;
  templateTag: string;
  fillRate: number;
  totalContacts: number;
  filledContacts: number;
}

export interface FillRateResult {
  blockers: FillRateField[];
  warnings: FillRateField[];
  allFields: FillRateField[];
}

// Fields that block enrollment if >5% are missing
const BLOCKING_FIELDS: Record<string, { dbField: string; label: string }> = {
  first_name: { dbField: 'firstName', label: 'First Name' },
  email: { dbField: 'email', label: 'Email' },
  company_name: { dbField: 'companyName', label: 'Company Name' },
  address: { dbField: 'address', label: 'Address' },
};

// Fields that warn if >30% are missing
const WARNING_FIELDS: Record<string, { dbField: string; label: string; fallback: string }> = {
  permit_description: { dbField: 'permitDescriptionDerived', label: 'Permit Description', fallback: 'a recent permit' },
  avg_job_value: { dbField: 'avgJobValue', label: 'Average Job Value', fallback: 'your recent work' },
  revenue: { dbField: 'revenue', label: 'Revenue', fallback: 'your team' },
  review_count: { dbField: 'reviewCount', label: 'Review Count', fallback: 'your reviews' },
  income_range: { dbField: 'incomeRange', label: 'Income Range', fallback: 'your area' },
  permit_date_friendly: { dbField: 'permitDateFriendly', label: 'Permit Date', fallback: 'recently' },
  permit_months_ago: { dbField: 'permitMonthsAgo', label: 'Permit Age', fallback: 'recently' },
  property_value: { dbField: 'propertyValue', label: 'Property Value', fallback: 'your property' },
};

class FillRateService {
  /**
   * Check fill rates for a batch of contacts against template fields.
   * @param contactIds - IDs of contacts to check
   * @param templateFields - merge tag names used in the template (e.g. ['first_name', 'permit_description'])
   */
  async checkFillRates(
    contactIds: string[],
    templateFields?: string[]
  ): Promise<FillRateResult> {
    if (contactIds.length === 0) {
      return { blockers: [], warnings: [], allFields: [] };
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      include: { company: { select: { name: true } } },
    });

    const total = contacts.length;
    if (total === 0) {
      return { blockers: [], warnings: [], allFields: [] };
    }

    const allFields: FillRateField[] = [];
    const blockers: FillRateField[] = [];
    const warnings: FillRateField[] = [];

    // Check blocking fields
    for (const [tag, def] of Object.entries(BLOCKING_FIELDS)) {
      if (templateFields && !templateFields.includes(tag)) continue;

      const filled = contacts.filter(c => {
        if (def.dbField === 'companyName') return !!c.company?.name;
        return !!(c as any)[def.dbField];
      }).length;

      const field: FillRateField = {
        field: def.label,
        templateTag: tag,
        fillRate: Math.round((filled / total) * 100),
        totalContacts: total,
        filledContacts: filled,
      };

      allFields.push(field);

      if (field.fillRate < 95) {
        blockers.push(field);
      }
    }

    // Check warning fields
    for (const [tag, def] of Object.entries(WARNING_FIELDS)) {
      if (templateFields && !templateFields.includes(tag)) continue;

      const filled = contacts.filter(c => {
        const enrichment = (c.enrichmentData || {}) as Record<string, any>;
        const val = (c as any)[def.dbField] ?? enrichment[def.dbField];
        return val !== null && val !== undefined && val !== '' && val !== 0;
      }).length;

      const field: FillRateField = {
        field: def.label,
        templateTag: tag,
        fillRate: Math.round((filled / total) * 100),
        totalContacts: total,
        filledContacts: filled,
      };

      allFields.push(field);

      if (field.fillRate < 70) {
        warnings.push({
          ...field,
          field: `Your template uses {{${tag}}} but only ${field.fillRate}% of these contacts have it. Consider using a fallback like '${def.fallback}'.`,
        });
      }
    }

    if (blockers.length > 0 || warnings.length > 0) {
      logger.warn(
        {
          contactCount: total,
          blockerCount: blockers.length,
          warningCount: warnings.length,
          blockerFields: blockers.map(b => b.templateTag),
          warningFields: warnings.map(w => w.templateTag),
        },
        'Fill rate check found issues'
      );
    }

    return { blockers, warnings, allFields };
  }

  /**
   * Quick check: returns true if enrollment should proceed, false if blockers exist.
   */
  async canEnroll(contactIds: string[], templateFields?: string[]): Promise<{
    ok: boolean;
    result: FillRateResult;
  }> {
    const result = await this.checkFillRates(contactIds, templateFields);
    return { ok: result.blockers.length === 0, result };
  }
}

export const fillRateService = new FillRateService();
