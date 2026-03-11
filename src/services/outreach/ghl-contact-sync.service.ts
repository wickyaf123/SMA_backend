/**
 * GHL Contact Sync Service
 * Syncs contacts from our database to GoHighLevel
 */

import { ghlClient } from '../../integrations/ghl/client';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { GHLContact } from '../../integrations/ghl/types';

interface SyncResult {
  ghlContactId: string;
  isNew: boolean;
}

class GHLContactSyncService {
  /**
   * Sync a contact to GoHighLevel (create or update)
   * Returns the GHL contact ID
   */
  async syncContactToGHL(contactId: string): Promise<SyncResult> {
    logger.info({ contactId }, 'Syncing contact to GHL');

    // Fetch contact from database
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { company: true },
    });

    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    // Check if contact already exists in GHL
    let ghlContact: GHLContact | null = null;

    if (contact.ghlContactId) {
      ghlContact = await ghlClient.getContact(contact.ghlContactId);
    }

    if (!ghlContact) {
      ghlContact = await ghlClient.findContactByEmailOrPhone(
        contact.email || undefined,
        contact.phone || undefined
      );
    }

    const enrichment = (contact.enrichmentData || {}) as Record<string, any>;
    const permitTags = (contact.tags || []).filter((t: string) => t.startsWith('permit:'));
    const ghlTags = [...(contact.tags || []), ...(!permitTags.length && contact.permitType ? [`permit:${contact.permitType}`] : [])];

    const contactData = {
      firstName: contact.firstName || undefined,
      lastName: contact.lastName || undefined,
      email: contact.email || undefined,
      phone: contact.phone || undefined,
      companyName: contact.company?.name || undefined,
      city: contact.city || undefined,
      state: contact.state || undefined,
      country: contact.country || undefined,
      website: contact.company?.website || undefined,
      timezone: contact.timezone || undefined,
      tags: ghlTags,
      source: 'PermitScraper.ai',
      customFields: [
        { key: 'title', field_value: contact.title || '' },
        { key: 'linkedin_url', field_value: contact.linkedinUrl || '' },
        { key: 'internal_contact_id', field_value: contact.id },
        { key: 'data_quality', field_value: contact.dataQuality?.toString() || '0' },
        { key: 'data_sources', field_value: (contact.dataSources || []).join(', ') },
        { key: 'permit_type', field_value: contact.permitType || '' },
        { key: 'permit_city', field_value: contact.permitCity || '' },
        { key: 'permit_date', field_value: enrichment.permitDate || '' },
        { key: 'permit_count', field_value: String(enrichment.permitCount || '') },
        { key: 'avg_job_value', field_value: String(enrichment.avgJobValue || '') },
        { key: 'total_job_value', field_value: String(enrichment.totalJobValue || '') },
        { key: 'company_revenue', field_value: enrichment.revenue || '' },
        { key: 'license_number', field_value: contact.licenseNumber || '' },
      ].filter(f => f.field_value !== ''),
    };

    if (ghlContact) {
      // Update existing contact
      logger.debug(
        { ghlContactId: ghlContact.id, contactId },
        'Updating existing GHL contact'
      );

      const updatedContact = await ghlClient.updateContact(ghlContact.id, contactData);

      // Update our database with GHL contact ID
      await prisma.contact.update({
        where: { id: contactId },
        data: { ghlContactId: updatedContact.id },
      });

      return { ghlContactId: updatedContact.id, isNew: false };
    } else {
      // Create new contact
      logger.debug({ contactId }, 'Creating new GHL contact');

      const newContact = await ghlClient.createContact(contactData);

      // Update our database with GHL contact ID
      await prisma.contact.update({
        where: { id: contactId },
        data: { ghlContactId: newContact.id },
      });

      return { ghlContactId: newContact.id, isNew: true };
    }
  }

  /**
   * Bulk sync multiple contacts to GHL
   */
  async bulkSyncToGHL(
    contactIds: string[]
  ): Promise<{ synced: number; failed: number; errors: Array<{ contactId: string; error: string }> }> {
    logger.info({ count: contactIds.length }, 'Bulk syncing contacts to GHL');

    let synced = 0;
    let failed = 0;
    const errors: Array<{ contactId: string; error: string }> = [];

    for (const contactId of contactIds) {
      try {
        await this.syncContactToGHL(contactId);
        synced++;
        
        // Rate limit: GHL allows ~10 requests/second
        // Wait 150ms between each contact to be safe
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (error: any) {
        logger.error(
          { contactId, error: error.message },
          'Failed to sync contact to GHL'
        );
        failed++;
        errors.push({ contactId, error: error.message });
      }
    }

    logger.info({ synced, failed }, 'Bulk sync to GHL completed');

    return { synced, failed, errors };
  }

  /**
   * Sync all contacts with specific criteria to GHL
   */
  async syncContactsByCriteria(criteria: {
    tags?: string[];
    minDataQuality?: number;
    dataSources?: string[];
    limit?: number;
  }): Promise<{ synced: number; failed: number }> {
    logger.info({ criteria }, 'Syncing contacts to GHL by criteria');

    const contacts = await prisma.contact.findMany({
      where: {
        ...(criteria.tags && criteria.tags.length > 0
          ? { tags: { hasSome: criteria.tags } }
          : {}),
        ...(criteria.minDataQuality ? { dataQuality: { gte: criteria.minDataQuality } } : {}),
        ...(criteria.dataSources && criteria.dataSources.length > 0
          ? { dataSources: { hasSome: criteria.dataSources } }
          : {}),
        // Only sync contacts with email OR phone
        OR: [
          { email: { not: '' } },
          { phone: { not: '' } }
        ],
      },
      take: criteria.limit || 1000,
      select: { id: true },
    });

    logger.info({ count: contacts.length }, 'Found contacts to sync to GHL');

    const contactIds = contacts.map((c) => c.id);
    const result = await this.bulkSyncToGHL(contactIds);

    return { synced: result.synced, failed: result.failed };
  }

  /**
   * Remove a contact from GHL
   */
  async removeFromGHL(contactId: string): Promise<void> {
    logger.info({ contactId }, 'Removing contact from GHL');

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { ghlContactId: true },
    });

    if (!contact?.ghlContactId) {
      logger.warn({ contactId }, 'Contact has no GHL ID, skipping removal');
      return;
    }

    await ghlClient.deleteContact(contact.ghlContactId);

    // Clear GHL contact ID from our database
    await prisma.contact.update({
      where: { id: contactId },
      data: { ghlContactId: undefined, ghlConversationId: undefined },
    });

    logger.info({ contactId }, 'Contact removed from GHL');
  }
}

export const ghlContactSyncService = new GHLContactSyncService();

