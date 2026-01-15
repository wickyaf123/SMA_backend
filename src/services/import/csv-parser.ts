import Papa from 'papaparse';
import { logger } from '../../utils/logger';
import { columnMapperService, ColumnMapping } from './column-mapper';

/**
 * CSV parse result
 */
export interface CsvParseResult {
  success: boolean;
  rows: Record<string, any>[];
  headers: string[];
  totalRows: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
  mapping?: ColumnMapping;
}

/**
 * CSV parse options
 */
export interface CsvParseOptions {
  customMapping?: ColumnMapping;
  skipEmptyLines?: boolean;
  trimValues?: boolean;
  maxRows?: number;
}

/**
 * CSV Parser Service
 * Handles CSV file parsing with auto-detection and custom mapping
 */
export class CsvParserService {
  /**
   * Parse CSV file from buffer
   */
  public async parseFile(
    fileBuffer: Buffer,
    options: CsvParseOptions = {}
  ): Promise<CsvParseResult> {
    try {
      const {
        customMapping,
        skipEmptyLines = true,
        trimValues = true,
        maxRows,
      } = options;

      logger.info({ fileSize: fileBuffer.length }, 'Parsing CSV file');

      // Convert buffer to string
      const fileContent = fileBuffer.toString('utf-8');

      // Parse CSV
      const parseResult = Papa.parse<Record<string, any>>(fileContent, {
        header: true,
        skipEmptyLines,
        dynamicTyping: false, // Keep everything as strings for now
        preview: maxRows,
      }) as any;

      if (parseResult.errors && parseResult.errors.length > 0) {
        logger.warn({
          errorCount: parseResult.errors.length,
          errors: parseResult.errors.slice(0, 5), // Log first 5 errors
        }, 'CSV parsing encountered errors');
      }

      const headers = parseResult.meta?.fields || [];
      const rows = (parseResult.data || []) as Record<string, any>[];

      // Auto-detect column mapping
      let mapping = columnMapperService.autoDetectMapping(headers);

      // Apply custom mapping if provided
      if (customMapping) {
        mapping = columnMapperService.applyCustomMapping(mapping, customMapping);
      }

      // Validate mapping
      const validation = columnMapperService.validateMapping(mapping);
      if (!validation.isValid) {
        logger.error({
          missingFields: validation.missingFields,
          mapping,
        }, 'CSV column mapping validation failed');

        return {
          success: false,
          rows: [],
          headers,
          totalRows: rows.length,
          errors: validation.errors.map((msg, idx) => ({
            row: 0,
            message: msg,
          })),
          mapping,
        };
      }

      // Map rows to internal format
      const mappedRows = rows.map((row, idx) => {
        try {
          return columnMapperService.mapRow(row, mapping);
        } catch (error: any) {
          logger.warn({
            rowIndex: idx,
            error: error.message,
          }, 'Error mapping CSV row');
          return null;
        }
      }).filter(Boolean) as Record<string, any>[];

      const result: CsvParseResult = {
        success: true,
        rows: mappedRows,
        headers,
        totalRows: rows.length,
        errors: (parseResult.errors || []).map((err: any) => ({
          row: err.row || 0,
          message: err.message,
        })),
        mapping,
      };

      logger.info({
        totalRows: result.totalRows,
        successfullyMapped: mappedRows.length,
        errors: result.errors.length,
        headers,
        mapping,
      }, 'CSV parsing complete');

      return result;
    } catch (error: any) {
      logger.error({
        error: error.message,
      }, 'Failed to parse CSV file');

      return {
        success: false,
        rows: [],
        headers: [],
        totalRows: 0,
        errors: [{
          row: 0,
          message: `Failed to parse CSV: ${error.message}`,
        }],
      };
    }
  }

  /**
   * Parse CSV from string
   */
  public async parseString(
    csvContent: string,
    options: CsvParseOptions = {}
  ): Promise<CsvParseResult> {
    const buffer = Buffer.from(csvContent, 'utf-8');
    return this.parseFile(buffer, options);
  }

  /**
   * Validate CSV headers without parsing all rows
   */
  public async validateHeaders(
    fileBuffer: Buffer
  ): Promise<{
    isValid: boolean;
    headers: string[];
    suggestedMapping: ColumnMapping;
    suggestions: Record<string, string[]>;
    missingFields: string[];
  }> {
    try {
      const fileContent = fileBuffer.toString('utf-8');

      // Parse only first row to get headers
      const parseResult = Papa.parse(fileContent, {
        header: true,
        preview: 1,
      });

      const headers = parseResult.meta.fields || [];

      // Auto-detect mapping
      const suggestedMapping = columnMapperService.autoDetectMapping(headers);

      // Validate mapping
      const validation = columnMapperService.validateMapping(suggestedMapping);

      // Get suggestions for unmapped headers
      const suggestions = columnMapperService.suggestMappings(headers);

      logger.info({
        headers,
        suggestedMapping,
        isValid: validation.isValid,
        missingFields: validation.missingFields,
      }, 'CSV headers validated');

      return {
        isValid: validation.isValid,
        headers,
        suggestedMapping,
        suggestions,
        missingFields: validation.missingFields,
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
      }, 'Failed to validate CSV headers');

      throw error;
    }
  }

  /**
   * Generate example CSV template
   */
  public generateTemplate(): string {
    const headers = [
      'Email',
      'First Name',
      'Last Name',
      'Title',
      'Phone',
      'LinkedIn URL',
      'Company',
      'Company Website',
      'Industry',
      'City',
      'State',
      'Country',
      'Tags',
    ];

    const exampleRow = [
      'john.doe@example.com',
      'John',
      'Doe',
      'CEO',
      '+1-555-123-4567',
      'https://linkedin.com/in/johndoe',
      'Example Corp',
      'https://example.com',
      'Technology',
      'San Francisco',
      'CA',
      'United States',
      'hvac,qualified',
    ];

    return Papa.unparse({
      fields: headers,
      data: [exampleRow],
    });
  }
}

// Export singleton instance
export const csvParserService = new CsvParserService();

