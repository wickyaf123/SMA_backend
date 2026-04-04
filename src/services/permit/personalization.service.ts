export interface PermitPersonalizationVars {
  first_name: string;
  company_name: string;
  permit_type: string;
  permit_city: string;
  permit_date_friendly: string;
  permit_months_ago: number;
}

export interface ContractorPersonalizationVars {
  first_name: string;
  company_name: string;
  permit_type: string;
  permit_city: string;
  permit_date_friendly: string;
  permit_months_ago: string;
  permit_description: string;
  avg_job_value: string;
  permit_count: string;
  revenue: string;
  review_count: string;
}

export interface HomeownerPersonalizationVars {
  first_name: string;
  address: string;
  permit_type: string;
  permit_date_friendly: string;
  permit_months_ago: string;
  property_value: string;
  permit_description: string;
  income_range: string;
}

export class PermitPersonalizationService {
  /**
   * Backward-compatible wrapper that returns the legacy PermitPersonalizationVars shape.
   * Delegates to buildContractorVariables internally.
   */
  buildVariables(contact: any): PermitPersonalizationVars {
    const vars = this.buildContractorVariables(contact);
    return {
      first_name: vars.first_name,
      company_name: vars.company_name,
      permit_type: vars.permit_type,
      permit_city: vars.permit_city,
      permit_date_friendly: vars.permit_date_friendly,
      permit_months_ago: this.monthsAgo(contact.enrichmentData?.permitDate),
    };
  }

  buildContractorVariables(contact: any): ContractorPersonalizationVars {
    const permitDateFriendly = contact.permitDateFriendly
      || this.formatDate(contact.enrichmentData?.permitDate);

    const permitMonthsAgo = contact.permitMonthsAgo != null
      ? this.formatMonthsAgo(contact.permitMonthsAgo)
      : this.formatMonthsAgo(this.monthsAgo(contact.enrichmentData?.permitDate));

    return {
      first_name: contact.firstName || 'there',
      company_name: contact.company?.name || '',
      permit_type: contact.enrichmentData?.primaryPermitType
        || contact.permitType
        || contact.enrichmentData?.permitType
        || 'permit',
      permit_city: contact.permitCity || contact.enrichmentData?.permitCity || '',
      permit_date_friendly: permitDateFriendly,
      permit_months_ago: permitMonthsAgo,
      permit_description: contact.permitDescriptionDerived
        || contact.permitDescription
        || contact.enrichmentData?.permitDescription
        || '',
      avg_job_value: this.formatCurrency(
        contact.avgJobValue || contact.enrichmentData?.avgJobValue,
      ),
      permit_count: String(
        contact.permitCount || contact.enrichmentData?.permitCount || '',
      ),
      revenue: this.formatRevenue(
        contact.revenue || contact.enrichmentData?.revenue || contact.company?.revenue,
      ),
      review_count: String(
        contact.reviewCount || contact.enrichmentData?.reviewCount || '',
      ),
    };
  }

  buildHomeownerVariables(record: any): HomeownerPersonalizationVars {
    const permitDateFriendly = record.permitDateFriendly
      || this.formatDate(record.enrichmentData?.permitDate);

    const permitMonthsAgo = record.permitMonthsAgo != null
      ? this.formatMonthsAgo(record.permitMonthsAgo)
      : this.formatMonthsAgo(this.monthsAgo(record.enrichmentData?.permitDate));

    return {
      first_name: record.firstName || record.ownerName?.split(' ')[0] || 'there',
      address: record.address || record.propertyAddress || '',
      permit_type: record.enrichmentData?.primaryPermitType
        || record.permitType
        || record.enrichmentData?.permitType
        || 'permit',
      permit_date_friendly: permitDateFriendly,
      permit_months_ago: permitMonthsAgo,
      property_value: this.formatCurrency(
        record.propertyValue || record.estimatedValue,
      ),
      permit_description: record.permitDescriptionDerived || record.permitDescription || '',
      income_range: record.incomeRange || record.enrichmentData?.incomeRange || '',
    };
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------

  formatCurrency(value?: number | string): string {
    if (!value) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';
    return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  formatRevenue(value?: string | number): string {
    if (!value) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  formatMonthsAgo(months?: number): string {
    if (!months || months <= 0) return 'recently';
    return `${months} months ago`;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private formatDate(date?: string | Date): string {
    if (!date) return 'recently';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  private monthsAgo(date?: string | Date): number {
    if (!date) return 0;
    const diffMs = Date.now() - new Date(date).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  }
}

export const permitPersonalizationService = new PermitPersonalizationService();
