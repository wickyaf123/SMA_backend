export interface PermitPersonalizationVars {
  first_name: string;
  company_name: string;
  permit_type: string;
  permit_city: string;
  permit_date_friendly: string;
  permit_months_ago: number;
}

export class PermitPersonalizationService {
  buildVariables(contact: any): PermitPersonalizationVars {
    return {
      first_name: contact.firstName || 'there',
      company_name: contact.company?.name || '',
      permit_type: contact.enrichmentData?.primaryPermitType || contact.permitType || contact.enrichmentData?.permitType || 'permit',
      permit_city: contact.permitCity || contact.enrichmentData?.permitCity || '',
      permit_date_friendly: this.formatDate(contact.enrichmentData?.permitDate),
      permit_months_ago: this.monthsAgo(contact.enrichmentData?.permitDate),
    };
  }

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
