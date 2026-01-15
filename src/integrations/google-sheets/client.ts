import { google } from 'googleapis';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { config } from '../../config';

export interface GoogleSheetsConfig {
  serviceAccountEmail?: string;
  privateKey?: string;
}

export class GoogleSheetsClient {
  private sheets: any;
  private auth: any;

  constructor(googleConfig?: GoogleSheetsConfig) {
    const serviceAccountEmail = googleConfig?.serviceAccountEmail || config.googleSheets.serviceAccountEmail;
    const privateKey = googleConfig?.privateKey || config.googleSheets.privateKey;

    if (!serviceAccountEmail || !privateKey) {
      logger.warn('Google Sheets credentials not configured - service will be disabled');
      return;
    }

    try {
      // Initialize auth with service account
      this.auth = new google.auth.JWT({
        email: serviceAccountEmail,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });

      logger.info('Google Sheets client initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Google Sheets client');
      throw new AppError(
        'Failed to initialize Google Sheets client',
        500,
        'GOOGLE_SHEETS_INIT_ERROR'
      );
    }
  }

  /**
   * Extract spreadsheet ID from Google Sheets URL
   */
  private extractSpreadsheetId(url: string): string {
    // Handle various Google Sheets URL formats
    // https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit...
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new AppError('Invalid Google Sheets URL', 400, 'INVALID_SHEETS_URL');
    }
    return match[1];
  }

  /**
   * Append rows to a Google Sheet
   * @param sheetUrl - Full Google Sheets URL
   * @param rows - 2D array of values to append
   * @param range - Optional range (defaults to Sheet1)
   */
  async appendRows(
    sheetUrl: string,
    rows: any[][],
    range: string = 'Sheet1'
  ): Promise<void> {
    if (!this.sheets) {
      throw new AppError(
        'Google Sheets client not initialized',
        500,
        'GOOGLE_SHEETS_NOT_CONFIGURED'
      );
    }

    try {
      const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

      logger.info(
        {
          spreadsheetId,
          rowCount: rows.length,
          range,
        },
        'Appending rows to Google Sheet'
      );

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows,
        },
      });

      logger.info(
        {
          spreadsheetId,
          updatedRows: response.data.updates.updatedRows,
          updatedRange: response.data.updates.updatedRange,
        },
        'Successfully appended rows to Google Sheet'
      );
    } catch (error: any) {
      logger.error(
        {
          error,
          sheetUrl,
          rowCount: rows.length,
          errorMessage: error.message,
          errorCode: error.code,
        },
        'Failed to append rows to Google Sheet'
      );

      if (error.code === 403) {
        throw new AppError(
          'Permission denied. Make sure the Google Sheet is shared with the service account',
          403,
          'GOOGLE_SHEETS_PERMISSION_DENIED'
        );
      } else if (error.code === 404) {
        throw new AppError(
          'Spreadsheet not found. Check the URL',
          404,
          'GOOGLE_SHEETS_NOT_FOUND'
        );
      }

      throw new AppError(
        'Failed to append rows to Google Sheet',
        500,
        'GOOGLE_SHEETS_APPEND_ERROR'
      );
    }
  }

  /**
   * Clear all rows from a sheet (keeping headers)
   * @param sheetUrl - Full Google Sheets URL
   * @param range - Range to clear (defaults to Sheet1!A2:Z)
   */
  async clearRows(sheetUrl: string, range: string = 'Sheet1!A2:Z'): Promise<void> {
    if (!this.sheets) {
      throw new AppError(
        'Google Sheets client not initialized',
        500,
        'GOOGLE_SHEETS_NOT_CONFIGURED'
      );
    }

    try {
      const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

      logger.info(
        {
          spreadsheetId,
          range,
        },
        'Clearing rows from Google Sheet'
      );

      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });

      logger.info({ spreadsheetId }, 'Successfully cleared Google Sheet');
    } catch (error: any) {
      logger.error({ error, sheetUrl }, 'Failed to clear Google Sheet');
      throw new AppError(
        'Failed to clear Google Sheet',
        500,
        'GOOGLE_SHEETS_CLEAR_ERROR'
      );
    }
  }

  /**
   * Get values from a sheet
   * @param sheetUrl - Full Google Sheets URL
   * @param range - Range to read (defaults to Sheet1)
   */
  async getValues(sheetUrl: string, range: string = 'Sheet1'): Promise<any[][]> {
    if (!this.sheets) {
      throw new AppError(
        'Google Sheets client not initialized',
        500,
        'GOOGLE_SHEETS_NOT_CONFIGURED'
      );
    }

    try {
      const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

      logger.debug({ spreadsheetId, range }, 'Reading values from Google Sheet');

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      return response.data.values || [];
    } catch (error: any) {
      logger.error({ error, sheetUrl }, 'Failed to read Google Sheet');
      throw new AppError(
        'Failed to read Google Sheet',
        500,
        'GOOGLE_SHEETS_READ_ERROR'
      );
    }
  }

  /**
   * Update specific cells in a sheet
   * @param sheetUrl - Full Google Sheets URL
   * @param range - Range to update (e.g., 'Sheet1!A1:B2')
   * @param values - 2D array of values to write
   */
  async updateValues(
    sheetUrl: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    if (!this.sheets) {
      throw new AppError(
        'Google Sheets client not initialized',
        500,
        'GOOGLE_SHEETS_NOT_CONFIGURED'
      );
    }

    try {
      const spreadsheetId = this.extractSpreadsheetId(sheetUrl);

      logger.info(
        {
          spreadsheetId,
          range,
          rowCount: values.length,
        },
        'Updating Google Sheet values'
      );

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      });

      logger.info({ spreadsheetId, range }, 'Successfully updated Google Sheet');
    } catch (error: any) {
      logger.error({ error, sheetUrl }, 'Failed to update Google Sheet');
      throw new AppError(
        'Failed to update Google Sheet',
        500,
        'GOOGLE_SHEETS_UPDATE_ERROR'
      );
    }
  }

  /**
   * Check if client is configured and ready
   */
  isConfigured(): boolean {
    return !!this.sheets;
  }
}

// Export singleton instance
export const googleSheetsClient = new GoogleSheetsClient();

