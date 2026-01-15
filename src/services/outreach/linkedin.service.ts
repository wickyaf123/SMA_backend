import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { googleSheetsClient } from '../../integrations/google-sheets/client';
import type { EnrollmentStatus } from '@prisma/client';

export interface LinkedInEnrollmentOptions {
  customFields?: Record<string, string>;
  clearExisting?: boolean;
}

export interface LinkedInEnrollmentResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ contactId: string; error: string }>;
}

export class LinkedInOutreachService {
  /**
   * Enroll contacts in PhantomBuster LinkedIn campaign by exporting to Google Sheets
   */
  async enrollInPhantomBuster(
    campaignId: string,
    contactIds: string[],
    options: LinkedInEnrollmentOptions = {}
  ): Promise<LinkedInEnrollmentResult> {
    const result: LinkedInEnrollmentResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      logger.info(
        { campaignId, contactCount: contactIds.length },
        'Starting PhantomBuster LinkedIn enrollment'
      );

      // Check if Google Sheets is configured
      if (!googleSheetsClient.isConfigured()) {
        throw new AppError(
          'Google Sheets is not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to .env',
          500,
          'GOOGLE_SHEETS_NOT_CONFIGURED'
        );
      }

      // Get campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      if (campaign.channel !== 'LINKEDIN') {
        throw new AppError(
          'Campaign is not a LinkedIn campaign',
          400,
          'INVALID_CAMPAIGN_CHANNEL'
        );
      }

      if (!campaign.googleSheetUrl) {
        throw new AppError(
          'Campaign has no Google Sheet URL configured',
          400,
          'MISSING_GOOGLE_SHEET_URL'
        );
      }

      // Get contacts with LinkedIn URLs
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          linkedinUrl: { not: null },
          status: { notIn: ['UNSUBSCRIBED', 'BOUNCED'] },
        },
        include: {
          company: {
            select: {
              name: true,
              industry: true,
              website: true,
              location: true,
            },
          },
        },
      });

      logger.info(
        {
          requested: contactIds.length,
          eligible: contacts.length,
        },
        'Filtered eligible contacts with LinkedIn URLs'
      );

      result.skipped = contactIds.length - contacts.length;

      if (contacts.length === 0) {
        logger.warn({ campaignId }, 'No eligible contacts found for LinkedIn enrollment');
        return result;
      }

      // Prepare rows for Google Sheets
      // PhantomBuster LinkedIn Outreach expects: LinkedIn URL, First Name, Last Name, Company, Title, etc.
      const rows = contacts.map((contact) => [
        contact.linkedinUrl!, // LinkedIn Profile URL (required)
        contact.firstName || '',
        contact.lastName || '',
        contact.company?.name || '',
        contact.title || '',
        contact.email || '',
        contact.phone || '',
        contact.company?.industry || '',
        contact.company?.location || '',
        // Add any custom fields
        ...(options.customFields
          ? Object.values(options.customFields)
          : []),
      ]);

      // Clear existing rows if requested
      if (options.clearExisting) {
        logger.info({ campaignId }, 'Clearing existing rows from Google Sheet');
        await googleSheetsClient.clearRows(campaign.googleSheetUrl, 'Sheet1!A2:Z');
      }

      // Append rows to Google Sheet
      try {
        await googleSheetsClient.appendRows(campaign.googleSheetUrl, rows);
        result.success = contacts.length;

        logger.info(
          {
            campaignId,
            sheetUrl: campaign.googleSheetUrl,
            rowCount: rows.length,
          },
          'Contacts exported to Google Sheet successfully'
        );
      } catch (error: any) {
        result.failed = contacts.length;
        result.errors.push({
          contactId: 'bulk',
          error: error.message || 'Failed to write to Google Sheet',
        });

        logger.error(
          { error, campaignId, contactCount: contacts.length },
          'Failed to export contacts to Google Sheet'
        );

        throw error;
      }

      // Create enrollment records for all contacts
      for (const contact of contacts) {
        try {
          await prisma.campaignEnrollment.upsert({
            where: {
              campaignId_contactId: {
                campaignId,
                contactId: contact.id,
              },
            },
            create: {
              campaignId,
              contactId: contact.id,
              status: 'ENROLLED' as EnrollmentStatus,
              metadata: {
                googleSheetUrl: campaign.googleSheetUrl,
                enrolledVia: 'google_sheets',
                linkedinUrl: contact.linkedinUrl,
              },
            },
            update: {
              status: 'ENROLLED' as EnrollmentStatus,
              stoppedAt: null,
              stoppedReason: null,
            },
          });

          // Update contact status
          if (contact.status === 'NEW' || contact.status === 'VALIDATED') {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { status: 'IN_SEQUENCE' },
            });
          }

          logger.debug(
            { contactId: contact.id, linkedinUrl: contact.linkedinUrl },
            'Contact enrolled in LinkedIn campaign'
          );
        } catch (error: any) {
          logger.error(
            { error, contactId: contact.id },
            'Failed to create enrollment record'
          );
          // Don't fail the whole operation if enrollment record creation fails
        }
      }

      logger.info(
        {
          campaignId,
          success: result.success,
          skipped: result.skipped,
        },
        'LinkedIn enrollment complete'
      );

      return result;
    } catch (error) {
      logger.error({ error, campaignId, contactIds }, 'LinkedIn enrollment failed');
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Failed to enroll contacts in LinkedIn campaign',
        500,
        'LINKEDIN_ENROLLMENT_ERROR'
      );
    }
  }

  /**
   * Export contacts to Google Sheet without creating campaign enrollment
   * Useful for one-time exports
   */
  async exportToGoogleSheet(
    sheetUrl: string,
    contactIds: string[],
    options: {
      includeHeaders?: boolean;
      clearExisting?: boolean;
      customFields?: Record<string, string>;
    } = {}
  ): Promise<number> {
    try {
      logger.info(
        { sheetUrl, contactCount: contactIds.length },
        'Exporting contacts to Google Sheet'
      );

      // Check if Google Sheets is configured
      if (!googleSheetsClient.isConfigured()) {
        throw new AppError(
          'Google Sheets is not configured',
          500,
          'GOOGLE_SHEETS_NOT_CONFIGURED'
        );
      }

      // Get contacts with LinkedIn URLs
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          linkedinUrl: { not: null },
        },
        include: {
          company: {
            select: {
              name: true,
              industry: true,
              website: true,
              location: true,
            },
          },
        },
      });

      const rows: any[][] = [];

      // Add headers if requested
      if (options.includeHeaders) {
        const headers = [
          'LinkedIn URL',
          'First Name',
          'Last Name',
          'Company',
          'Title',
          'Email',
          'Phone',
          'Industry',
          'Location',
        ];

        if (options.customFields) {
          headers.push(...Object.keys(options.customFields));
        }

        rows.push(headers);
      }

      // Add contact rows
      contacts.forEach((contact) => {
        rows.push([
          contact.linkedinUrl!,
          contact.firstName || '',
          contact.lastName || '',
          contact.company?.name || '',
          contact.title || '',
          contact.email || '',
          contact.phone || '',
          contact.company?.industry || '',
          contact.company?.location || '',
          ...(options.customFields ? Object.values(options.customFields) : []),
        ]);
      });

      // Clear existing rows if requested
      if (options.clearExisting) {
        const range = options.includeHeaders ? 'Sheet1!A1:Z' : 'Sheet1!A2:Z';
        await googleSheetsClient.clearRows(sheetUrl, range);
      }

      // Append rows
      await googleSheetsClient.appendRows(sheetUrl, rows);

      logger.info(
        {
          sheetUrl,
          rowCount: rows.length,
          contactCount: contacts.length,
        },
        'Contacts exported to Google Sheet successfully'
      );

      return contacts.length;
    } catch (error) {
      logger.error({ error, sheetUrl, contactIds }, 'Failed to export to Google Sheet');
      throw error;
    }
  }

  /**
   * Get PhantomBuster setup instructions for a campaign
   */
  getSetupInstructions(googleSheetUrl: string): string {
    return `
PhantomBuster LinkedIn Outreach Setup Instructions:

1. Log into PhantomBuster (https://phantombuster.com)
2. Create a new "LinkedIn Outreach" automation
3. Configure the input source:
   - Select "Google Sheets"
   - Paste this URL: ${googleSheetUrl}
4. Configure the connection message template (optional)
5. Set daily limits (recommended: start with 10-20/day)
6. Configure follow-up messages (up to 3)
7. Launch the automation or set a schedule

Important:
- Make sure the Google Sheet is shared with: ${googleSheetsClient.isConfigured() ? 'your service account' : 'NOT CONFIGURED'}
- The sheet should have LinkedIn URLs in the first column
- PhantomBuster will read new rows automatically
- Start with low daily limits to avoid LinkedIn restrictions
    `.trim();
  }
}

export const linkedInOutreachService = new LinkedInOutreachService();

