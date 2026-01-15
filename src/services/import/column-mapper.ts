import { logger } from '../../utils/logger';

/**
 * Column mapping configuration
 */
export interface ColumnMapping {
  [key: string]: string; // csvColumn -> dbField
}

/**
 * Common column name variations for auto-detection
 */
const COLUMN_VARIATIONS: Record<string, string[]> = {
  // Contact fields
  email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail', 'contact email'],
  firstName: ['first name', 'firstname', 'first', 'fname', 'given name', 'givenname'],
  lastName: ['last name', 'lastname', 'last', 'lname', 'surname', 'family name', 'familyname'],
  fullName: ['full name', 'fullname', 'name', 'contact name', 'contactname'],
  title: ['title', 'job title', 'jobtitle', 'position', 'role'],
  phone: ['phone', 'phone number', 'phonenumber', 'tel', 'telephone', 'mobile', 'cell', 'contact number'],
  linkedinUrl: ['linkedin', 'linkedin url', 'linkedinurl', 'linkedin profile', 'li url'],
  
  // Location fields
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region', 'st'],
  country: ['country', 'nation'],
  
  // Company fields
  companyName: ['company', 'company name', 'companyname', 'organization', 'org', 'business'],
  companyWebsite: ['website', 'company website', 'companywebsite', 'url', 'company url', 'domain'],
  companyPhone: ['company phone', 'companyphone', 'business phone', 'office phone'],
  industry: ['industry', 'sector', 'vertical'],
  companySize: ['company size', 'companysize', 'employees', 'employee count', 'size'],
  revenue: ['revenue', 'annual revenue', 'annualrevenue', 'sales'],
  
  // Metadata
  tags: ['tags', 'tag', 'labels', 'categories'],
  source: ['source', 'lead source', 'leadsource', 'origin'],
};

/**
 * Required fields for import
 */
const REQUIRED_FIELDS = ['email'];

/**
 * Column Mapper Service
 * Handles automatic and custom column mapping for CSV imports
 */
export class ColumnMapperService {
  /**
   * Auto-detect column mapping from CSV headers
   */
  public autoDetectMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};

    logger.debug({ headers }, 'Auto-detecting column mapping');

    for (const header of headers) {
      const normalizedHeader = this.normalizeHeader(header);
      const mappedField = this.findBestMatch(normalizedHeader);

      if (mappedField) {
        mapping[header] = mappedField;
        logger.debug({ header, mappedField }, 'Auto-mapped column');
      }
    }

    logger.info({
      totalHeaders: headers.length,
      mappedColumns: Object.keys(mapping).length,
      mapping,
    }, 'Auto-detection complete');

    return mapping;
  }

  /**
   * Apply custom mapping overrides to auto-detected mapping
   */
  public applyCustomMapping(
    autoMapping: ColumnMapping,
    customMapping: ColumnMapping
  ): ColumnMapping {
    const finalMapping = { ...autoMapping };

    for (const [csvColumn, dbField] of Object.entries(customMapping)) {
      finalMapping[csvColumn] = dbField;
      logger.debug({
        csvColumn,
        dbField,
        wasAutoMapped: csvColumn in autoMapping,
      }, 'Applied custom mapping');
    }

    return finalMapping;
  }

  /**
   * Validate that required fields are mapped
   */
  public validateMapping(mapping: ColumnMapping): {
    isValid: boolean;
    missingFields: string[];
    errors: string[];
  } {
    const mappedFields = new Set(Object.values(mapping));
    const missingFields: string[] = [];
    const errors: string[] = [];

    // Check required fields
    for (const required of REQUIRED_FIELDS) {
      if (!mappedFields.has(required)) {
        missingFields.push(required);
        errors.push(`Required field '${required}' is not mapped`);
      }
    }

    const isValid = missingFields.length === 0;

    if (!isValid) {
      logger.warn({
        missingFields,
        mapping,
      }, 'Column mapping validation failed');
    }

    return { isValid, missingFields, errors };
  }

  /**
   * Map a CSV row to contact data using the provided mapping
   */
  public mapRow(
    row: Record<string, any>,
    mapping: ColumnMapping
  ): Record<string, any> {
    const mapped: Record<string, any> = {};

    for (const [csvColumn, dbField] of Object.entries(mapping)) {
      const value = row[csvColumn];
      
      if (value !== undefined && value !== null && value !== '') {
        // Clean and normalize value
        const normalizedValue = typeof value === 'string' ? value.trim() : value;
        mapped[dbField] = normalizedValue;
      }
    }

    // Special handling for full name
    if (!mapped.fullName && (mapped.firstName || mapped.lastName)) {
      mapped.fullName = [mapped.firstName, mapped.lastName]
        .filter(Boolean)
        .join(' ');
    }

    // Special handling for phone formatting
    if (mapped.phone) {
      mapped.phone = this.normalizePhone(mapped.phone);
    }

    // Special handling for tags (convert string to array)
    if (mapped.tags && typeof mapped.tags === 'string') {
      mapped.tags = mapped.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    }

    return mapped;
  }

  /**
   * Normalize header name for matching
   */
  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .trim()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /**
   * Find best matching field for a header
   */
  private findBestMatch(normalizedHeader: string): string | null {
    for (const [field, variations] of Object.entries(COLUMN_VARIATIONS)) {
      for (const variation of variations) {
        if (normalizedHeader === variation) {
          return field;
        }
      }
    }

    return null;
  }

  /**
   * Normalize phone number (remove formatting)
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digit characters except + at the start
    return phone.replace(/[^\d+]/g, '').replace(/\+(?=.)/g, '');
  }

  /**
   * Get suggested mappings for unmapped headers
   */
  public suggestMappings(headers: string[]): Record<string, string[]> {
    const suggestions: Record<string, string[]> = {};

    for (const header of headers) {
      const normalized = this.normalizeHeader(header);
      const possibleFields: string[] = [];

      // Find all fields that might match
      for (const [field, variations] of Object.entries(COLUMN_VARIATIONS)) {
        for (const variation of variations) {
          if (normalized.includes(variation) || variation.includes(normalized)) {
            if (!possibleFields.includes(field)) {
              possibleFields.push(field);
            }
          }
        }
      }

      if (possibleFields.length > 0) {
        suggestions[header] = possibleFields;
      }
    }

    return suggestions;
  }
}

// Export singleton instance
export const columnMapperService = new ColumnMapperService();

