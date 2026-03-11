import { prisma } from '../../config/database';
import { config } from '../../config';
import { apolloClient } from '../../integrations/apollo/client';
import { normalizeApolloContact } from '../../integrations/apollo/normalizer';
import { emailValidationService } from '../validation/email.service';
import { phoneValidationService } from '../validation/phone.service';
import { deduplicationService } from './deduplication.service';
import { csvParserService, CsvParseOptions } from '../import/csv-parser';
import { importJobService } from '../import/import-job.service';
import { settingsService } from '../settings/settings.service';
import { logger } from '../../utils/logger';
import { ApolloSearchParams } from '../../integrations/apollo/types';
import { ImportJobType, ContactStatus } from '@prisma/client';
import { shouldExcludeCompany } from '../../integrations/contractor-constants';

/**
 * Import result summary
 */
export interface ImportResult {
  jobId: string;
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  errors: Array<{
    row: number;
    email: string;
    error: string;
  }>;
}

/**
 * Lead Ingestion Service
 * Orchestrates the entire lead import process
 */
export class LeadIngestionService {
  /**
   * Import leads from Apollo API (Auto-Enrich workflow)
   * 
   * This uses a two-step process:
   * 1. Search Apollo (FREE - returns person IDs with obfuscated data)
   * 2. Enrich in batches (COSTS CREDITS - max 10 per batch)
   * 3. Optionally request mobile phones via webhook (ASYNC)
   * 
   * @param searchParams - Apollo search filters
   * @param enrichLimit - Maximum number of contacts to enrich (default: 100)
   */
  public async importFromApollo(
    searchParams: ApolloSearchParams,
    enrichLimit: number = 100
  ): Promise<ImportResult> {
    const jobId = await importJobService.createJob(
      ImportJobType.APOLLO,
      0, // Will update after search
      { searchParams, enrichLimit }
    );

    try {
      await importJobService.startJob(jobId);

      logger.info({
        jobId,
        searchParams,
        enrichLimit,
      }, 'Starting Apollo import with two-step enrichment');

      // ==================== STEP 1: SEARCH (FREE) ====================
      logger.info({ jobId }, 'Step 1: Searching Apollo (free, no credits)');
      
      const searchResult = await apolloClient.searchPeoplePreview(searchParams);
      const totalFound = searchResult.total_entries;
      const personIds = searchResult.people
        .slice(0, enrichLimit)
        .map(p => p.id);

      logger.info({
        jobId,
        totalFound,
        toEnrich: personIds.length,
      }, 'Apollo search complete');

      // Update job with total records to enrich
      await prisma.importJob.update({
        where: { id: jobId },
        data: { totalRecords: personIds.length },
      });

      if (personIds.length === 0) {
        logger.warn({ jobId }, 'No contacts found in Apollo search');
        await importJobService.completeJob(jobId);
        return {
          jobId,
          total: 0,
          imported: 0,
          duplicates: 0,
          invalid: 0,
          errors: [],
        };
      }

      // ==================== STEP 2: ENRICH IN BATCHES (COSTS CREDITS) ====================
      logger.info({ jobId }, 'Step 2: Enriching contacts in batches');
      
      const BATCH_SIZE = 10; // Apollo's max per bulk_match request
      const allEnrichedContacts: any[] = [];
      let totalCreditsConsumed = 0;

      for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
        const batch = personIds.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(personIds.length / BATCH_SIZE);

        try {
          const enrichResult = await apolloClient.enrichPeopleBulk(batch, true);
          allEnrichedContacts.push(...enrichResult.people);
          totalCreditsConsumed += enrichResult.credits_consumed || batch.length;

          logger.info({
            jobId,
            batch: batchNumber,
            totalBatches,
            batchSize: batch.length,
            enriched: allEnrichedContacts.length,
            creditsConsumed: enrichResult.credits_consumed,
            totalCreditsConsumed,
          }, 'Batch enriched successfully');
        } catch (error: any) {
          logger.error({
            jobId,
            batch: batchNumber,
            error: error.message,
          }, 'Failed to enrich batch');
          // Continue with next batch even if one fails
        }

        // Add delay between batches to respect rate limits (1 second)
        if (i + BATCH_SIZE < personIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info({
        jobId,
        totalEnriched: allEnrichedContacts.length,
        totalCreditsConsumed,
      }, 'All batches enriched');

      // ==================== STEP 3: NORMALIZE AND FILTER ====================
      logger.info({ jobId }, 'Step 3: Normalizing and filtering contacts');
      
      const normalizedContacts = allEnrichedContacts
        .map(c => {
          try {
            return normalizeApolloContact(c);
          } catch (error: any) {
            logger.warn({
              apolloId: c.id,
              error: error.message,
            }, 'Failed to normalize Apollo contact');
            return null;
          }
        })
        .filter(Boolean) as any[];

      // Filter out companies with excluded terms (wholesalers, manufacturers, etc.)
      const beforeFilterCount = normalizedContacts.length;
      const filteredContacts = normalizedContacts.filter(contact => {
        const companyName = contact.company?.name;
        if (companyName && shouldExcludeCompany(companyName)) {
          logger.debug({
            companyName,
            contactEmail: contact.email,
          }, 'Excluding contact - company name contains excluded term');
          return false;
        }
        return true;
      });

      const excludedCount = beforeFilterCount - filteredContacts.length;
      logger.info({
        jobId,
        beforeFilter: beforeFilterCount,
        afterFilter: filteredContacts.length,
        excluded: excludedCount,
      }, 'Company name filtering complete');

      // Process contacts (validation, deduplication, save)
      const result = await this.processContacts(jobId, filteredContacts);

      // Phone enrichment now handled by Clay enrichment pipeline

      // ==================== COMPLETE ====================
      await importJobService.completeJob(jobId);

      logger.info({
        jobId,
        result,
        creditsConsumed: totalCreditsConsumed,
      }, 'Apollo import completed successfully');

      return result;
    } catch (error: any) {
      await importJobService.failJob(jobId, error.message);
      logger.error({
        jobId,
        error: error.message,
        stack: error.stack,
      }, 'Apollo import failed');
      throw error;
    }
  }

  /**
   * Import leads from CSV file
   */
  public async importFromCsv(
    fileBuffer: Buffer,
    options?: CsvParseOptions
  ): Promise<ImportResult> {
    const jobId = await importJobService.createJob(
      ImportJobType.CSV,
      0, // Will update after parsing
      { options }
    );

    try {
      await importJobService.startJob(jobId);

      logger.info({
        jobId,
        fileSize: fileBuffer.length,
      }, 'Starting CSV import');

      // Parse CSV
      const parseResult = await csvParserService.parseFile(fileBuffer, options);

      if (!parseResult.success) {
        throw new Error(`CSV parsing failed: ${parseResult.errors[0]?.message || 'Unknown error'}`);
      }

      // Update total records
      await prisma.importJob.update({
        where: { id: jobId },
        data: { totalRecords: parseResult.rows.length },
      });

      // Convert CSV rows to normalized contact format
      const normalizedContacts = parseResult.rows.map((row) => ({
        email: row.email,
        firstName: row.firstName || null,
        lastName: row.lastName || null,
        fullName: row.fullName || [row.firstName, row.lastName].filter(Boolean).join(' '),
        title: row.title || null,
        phone: row.phone || null,
        linkedinUrl: row.linkedinUrl || null,
        city: row.city || null,
        state: row.state || null,
        country: row.country || null,
        timezone: null,
        source: 'csv' as const,
        sourceId: `csv-${jobId}`,
        apolloId: null,
        enrichmentData: {},
        company: row.companyName ? {
          name: row.companyName,
          domain: row.companyWebsite ? this.extractDomain(row.companyWebsite) : null,
          website: row.companyWebsite || null,
          phone: row.companyPhone || null,
          industry: row.industry || null,
          size: row.companySize || null,
          estimatedEmployees: null,
          estimatedRevenue: null,
          estimatedRevenueRange: row.revenue || null,
          location: null,
          city: row.city || null,
          state: row.state || null,
          country: row.country || null,
          address: null,
          linkedinUrl: null,
          foundedYear: null,
          description: null,
          apolloId: null,
          enrichmentData: {},
        } : undefined,
      }));

      // Process contacts
      const result = await this.processContacts(jobId, normalizedContacts);

      await importJobService.completeJob(jobId);

      logger.info({
        jobId,
        result,
      }, 'CSV import completed');

      return result;
    } catch (error: any) {
      await importJobService.failJob(jobId, error.message);
      logger.error({
        jobId,
        error,
      }, 'CSV import failed');
      throw error;
    }
  }

  /**
   * Process normalized contacts (validate, dedupe, save)
   */
  private async processContacts(
    jobId: string,
    contacts: any[]
  ): Promise<ImportResult> {
    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    const errors: Array<{ row: number; email: string; error: string }> = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const rowNumber = i + 1;

      try {
        logger.debug({
          jobId,
          email: contact.email,
          rowNumber,
          needsEmailEnrichment: contact.needsEmailEnrichment,
        }, 'Processing contact');

        // Check if this contact needs email enrichment (Google Maps without email)
        const needsEnrichment = contact.needsEmailEnrichment || (!contact.email && contact.source === 'google_maps');
        let emailValidationStatus = 'PENDING';
        let contactStatus: ContactStatus = ContactStatus.NEW;

        // 1. Validate email (if present)
        if (contact.email) {
          const emailValidation = await emailValidationService.validateEmail(contact.email);
          
          if (!emailValidation.isValid) {
            logger.warn({
              email: contact.email,
              validationResult: emailValidation.result,
            }, 'Email validation failed');
            
            invalid++;
            errors.push({
              row: rowNumber,
              email: contact.email,
              error: `Invalid email: ${emailValidation.result}`,
            });
            continue;
          }
          
          emailValidationStatus = emailValidation.isValid ? 'VALID' : 'INVALID';
          contactStatus = emailValidation.isValid ? ContactStatus.VALIDATED : ContactStatus.INVALID;
          contact.email = emailValidation.normalizedEmail || contact.email;
        } else if (needsEnrichment) {
          // No email but flagged for enrichment - allow import
          logger.info({
            rowNumber,
            company: contact.company?.name,
            source: contact.source,
          }, 'Contact without email - will be enriched via Hunter');
          emailValidationStatus = 'PENDING'; // PENDING indicates needs enrichment
          contactStatus = ContactStatus.NEW;
        } else {
          // No email and not flagged for enrichment - skip
          invalid++;
          errors.push({
            row: rowNumber,
            email: 'none',
            error: 'No email provided',
          });
          continue;
        }

        // 2. Validate phone if provided (immediate)
        let phoneValidationStatus = 'PENDING';
        if (contact.phone) {
          try {
            const phoneValidation = await phoneValidationService.validatePhone(contact.phone);
            phoneValidationStatus = phoneValidation.isMobile ? 'VALID_MOBILE' : 
                                   phoneValidation.isLandline ? 'VALID_LANDLINE' : 
                                   'INVALID';
            contact.phone = phoneValidation.e164Format;
            
            logger.info({
              phone: contact.phone,
              type: phoneValidationStatus,
            }, 'Phone validated successfully');
          } catch (error: any) {
            logger.warn({
              phone: contact.phone,
              error: error.message,
            }, 'Phone validation failed, continuing without phone');
            contact.phone = null;
          }
        }

        // 3. Check for duplicates (by email if available, by company+phone otherwise)
        if (contact.email) {
          const dupCheck = await deduplicationService.checkDuplicate(contact.email);
          
          if (dupCheck.isDuplicate) {
            logger.info({
              email: contact.email,
              existingContactId: dupCheck.existingContactId,
            }, 'Duplicate contact found, skipping');
            
            duplicates++;
            continue;
          }
        } else if (contact.googlePlaceId) {
          // Check by Google Place ID for contacts without email
          const existingByPlaceId = await prisma.contact.findFirst({
            where: { googlePlaceId: contact.googlePlaceId },
          });
          
          if (existingByPlaceId) {
            logger.info({
              googlePlaceId: contact.googlePlaceId,
              existingContactId: existingByPlaceId.id,
            }, 'Duplicate contact found by Place ID, skipping');
            
            duplicates++;
            continue;
          }
        }

        // 4. Create or find company
        let companyId: string | undefined;
        if (contact.company) {
          const company = await this.createOrFindCompany(contact.company);
          companyId = company.id;
        }

        // 5. Create contact
        // Generate a placeholder email for contacts pending enrichment (to satisfy unique constraint)
        const placeholderEmail = contact.email || `pending_${contact.googlePlaceId || Date.now()}_${Math.random().toString(36).slice(2, 7)}@needs-enrichment.local`;
        
        await prisma.contact.create({
          data: {
            email: placeholderEmail, // Placeholder for contacts pending enrichment
            firstName: contact.firstName,
            lastName: contact.lastName,
            fullName: contact.fullName,
            title: contact.title,
            phone: contact.phone,
            phoneFormatted: contact.phone,
            linkedinUrl: contact.linkedinUrl,
            city: contact.city,
            state: contact.state,
            country: contact.country,
            timezone: contact.timezone,
            companyId,
            status: contactStatus,
            emailValidationStatus: emailValidationStatus as any,
            phoneValidationStatus: phoneValidationStatus as any,
            emailValidatedAt: contact.email ? new Date() : null,
            phoneValidatedAt: contact.phone ? new Date() : null,
            source: contact.source,
            sourceId: contact.sourceId,
            apolloId: contact.apolloId,
            googlePlaceId: contact.googlePlaceId || null, // For Google Maps deduplication
            dataSources: contact.source === 'google_maps' ? ['GOOGLE_MAPS'] : [],
            enrichmentData: contact.enrichmentData,
          },
        });

        imported++;

        // Update progress every 10 contacts
        if (imported % 10 === 0 || i === contacts.length - 1) {
          await importJobService.updateProgress(jobId, {
            processedRecords: i + 1,
            successCount: imported,
            duplicateCount: duplicates,
            invalidCount: invalid,
            errorCount: errors.length,
          });
        }
      } catch (error: any) {
        logger.error({
          jobId,
          email: contact.email,
          error,
        }, 'Error processing contact');

        errors.push({
          row: rowNumber,
          email: contact.email,
          error: error.message,
        });
      }
    }

    // Final progress update
    await importJobService.updateProgress(jobId, {
      processedRecords: contacts.length,
      successCount: imported,
      duplicateCount: duplicates,
      invalidCount: invalid,
      errorCount: errors.length,
      errors: errors.slice(0, 100), // Store only first 100 errors
    });

    return {
      jobId,
      total: contacts.length,
      imported,
      duplicates,
      invalid,
      errors,
    };
  }

  /**
   * Create or find company by domain
   */
  private async createOrFindCompany(companyData: any): Promise<any> {
    // Try to find by domain first
    if (companyData.domain) {
      const existing = await prisma.company.findUnique({
        where: { domain: companyData.domain },
      });

      if (existing) {
        return existing;
      }
    }

    // Try to find by Apollo ID
    if (companyData.apolloId) {
      const existing = await prisma.company.findUnique({
        where: { apolloId: companyData.apolloId },
      });

      if (existing) {
        return existing;
      }
    }

    // Create new company
    return await prisma.company.create({
      data: {
        name: companyData.name,
        domain: companyData.domain,
        website: companyData.website,
        industry: companyData.industry,
        size: companyData.size,
        location: companyData.location,
        city: companyData.city,
        state: companyData.state,
        country: companyData.country,
        linkedinUrl: companyData.linkedinUrl,
        apolloId: companyData.apolloId,
        enrichmentData: companyData.enrichmentData,
      },
    });
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    }
  }
}

// Export singleton instance
export const leadIngestionService = new LeadIngestionService();

