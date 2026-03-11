import { google } from 'googleapis';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const SHEET_COLUMNS = [
  'Contractor Name', 'Contact Name', 'Title', 'Email', 'Email Status',
  'Phone', 'Phone Status', 'City', 'State', 'Permit Type', 'License #',
  'Permit Count', 'Shovels Contractor ID', 'Clay Status', 'Created At'
];

export class PermitSheetsService {
  private async getAuth() {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: config.googleSheets.serviceAccountEmail,
        private_key: config.googleSheets.privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
  }

  async createPermitSheet(title: string): Promise<{ sheetId: string; sheetUrl: string }> {
    const auth = await this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [
          { properties: { title: 'Raw' } },
          { properties: { title: 'Enriched' } },
          { properties: { title: 'Incomplete' } },
        ],
      },
    });

    const sheetId = response.data.spreadsheetId!;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;

    const tabNames = ['Raw', 'Enriched', 'Incomplete'];
    for (const tab of tabNames) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [SHEET_COLUMNS] },
      });
    }

    logger.info({ sheetId, sheetUrl }, 'Permit sheet created');
    return { sheetId, sheetUrl };
  }

  async writeContactsToTab(
    sheetId: string,
    tab: 'Raw' | 'Enriched' | 'Incomplete',
    contacts: any[]
  ): Promise<void> {
    const auth = await this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const rows = contacts.map(c => [
      c.company?.name || '',
      c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' '),
      c.title || '',
      c.email || '',
      c.emailValidationStatus || '',
      c.phone || '',
      c.phoneValidationStatus || '',
      c.city || '',
      c.state || '',
      c.enrichmentData?.permitType || c.permitType || '',
      c.licenseNumber || '',
      c.enrichmentData?.permitCount || '',
      c.shovelsContractorId || '',
      c.clayEnrichmentStatus || '',
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tab}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    logger.info({ tab, count: rows.length }, 'Wrote contacts to sheet tab');
  }
}

export const permitSheetsService = new PermitSheetsService();
