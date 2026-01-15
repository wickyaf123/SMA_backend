import Papa from 'papaparse';
import { contactService, ContactSearchFilters } from './contact.service';
import { logger } from '../../utils/logger';

/**
 * Contact Export Service
 * Exports contacts to CSV format
 */
export class ContactExportService {
  /**
   * Export contacts to CSV
   */
  public async exportToCSV(filters: ContactSearchFilters): Promise<string> {
    try {
      logger.info({ filters }, 'Exporting contacts to CSV');

      // Get all matching contacts (remove pagination)
      const result = await contactService.searchContacts({
        ...filters,
        page: 1,
        limit: 10000, // Max export limit
      });

      const contacts = result.data;

      // Transform contacts to flat structure for CSV
      // Includes all fields from contractor spec + standard fields
      const rows = contacts.map((contact: any) => ({
        // ===== CONTACT INFO (From Apollo + Google Maps) =====
        'Email': contact.email,
        'First Name': contact.firstName || '',
        'Last Name': contact.lastName || '',
        'Full Name': contact.fullName || '',
        'Title': contact.title || '',
        'Phone': contact.phone || '',
        'Phone Formatted': contact.phoneFormatted || '',
        'LinkedIn URL': contact.linkedinUrl || '',
        
        // ===== LOCATION =====
        'City': contact.city || '',
        'State': contact.state || '',
        'Country': contact.country || '',
        'Timezone': contact.timezone || '',
        'Address': contact.company?.address || '',
        'Zip Code': contact.company?.postalCode || '',
        
        // ===== COMPANY INFO (Apollo Fields) =====
        'Company Name': contact.company?.name || '',
        'Company Website': contact.company?.website || '',
        'Company Domain': contact.company?.domain || '',
        'Company Phone': contact.company?.phone || '',
        'Company Industry': contact.company?.industry || '',
        'Company Size': contact.company?.size || '',
        'Employee Count': contact.company?.estimatedEmployees || '',
        'Revenue Estimate': contact.company?.estimatedRevenue || '',
        'Revenue Range': contact.company?.estimatedRevenueRange || '',
        
        // ===== GOOGLE MAPS SPECIFIC FIELDS =====
        'Review Count': contact.enrichmentData?.reviewCount || '',
        'Average Rating': contact.enrichmentData?.rating || '',
        'Google Maps URL': contact.enrichmentData?.googleMapsUrl || '',
        'Place ID': contact.enrichmentData?.placeId || '',
        'Business Status': contact.enrichmentData?.businessStatus || '',
        
        // ===== APOLLO SPECIFIC FIELDS =====
        'Apollo ID': contact.apolloId || '',
        'Photo URL': contact.enrichmentData?.photoUrl || '',
        'Headline': contact.enrichmentData?.headline || '',
        'Seniority': contact.enrichmentData?.seniority || '',
        'Departments': (contact.enrichmentData?.departments || []).join(', '),
        'Email Status': contact.enrichmentData?.emailStatus || '',
        
        // ===== VALIDATION STATUS =====
        'Status': contact.status,
        'Email Validation': contact.emailValidationStatus,
        'Phone Validation': contact.phoneValidationStatus,
        
        // ===== ENGAGEMENT =====
        'Has Replied': contact.hasReplied ? 'Yes' : 'No',
        'Replied At': contact.repliedAt ? new Date(contact.repliedAt).toISOString() : '',
        'Last Contacted': contact.lastContactedAt ? new Date(contact.lastContactedAt).toISOString() : '',
        
        // ===== METADATA =====
        'Tags': (contact.tags || []).join(', '),
        'Source': contact.source || '',
        'Created At': new Date(contact.createdAt).toISOString(),
        'Updated At': contact.updatedAt ? new Date(contact.updatedAt).toISOString() : '',
        
        // ===== CUSTOM FIELDS (for Instantly.ai) =====
        'Owner Name': contact.fullName || '',
        'Work Email': contact.email || '',
        'Owner Phone': contact.phone || '',
      }));

      // Generate CSV
      const csv = Papa.unparse(rows);

      logger.info({
        totalContacts: rows.length,
        csvSize: csv.length,
      }, 'CSV export complete');

      return csv;
    } catch (error) {
      logger.error({
        filters,
        error,
      }, 'Failed to export contacts to CSV');
      throw error;
    }
  }

  /**
   * Get CSV filename with timestamp
   */
  public getFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    return `contacts-export-${timestamp}.csv`;
  }
}

// Export singleton instance
export const contactExportService = new ContactExportService();

