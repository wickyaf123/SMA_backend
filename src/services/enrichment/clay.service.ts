import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { clayClient } from '../../integrations/clay/client';
import type { ClayEnrichPayload, ClayWebhookPayload } from '../../integrations/clay/types';

export class ClayEnrichmentService {
  async enrichContact(contactId: string): Promise<{
    success: boolean;
    email?: string;
    error?: string;
  }> {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: { company: true },
      });

      if (!contact) {
        return { success: false, error: `Contact ${contactId} not found` };
      }

      const enrichmentData = (contact as any).enrichmentData || {};
      const payload: ClayEnrichPayload = {
        contactId: contact.id,
        email: contact.email || null,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        companyName: contact.company?.name || null,
        companyDomain: contact.company?.domain || null,
        permitType: (contact as any).permitType || null,
        permitCity: (contact as any).permitCity || null,
        shovelsHasEmail: !!contact.email,
        shovelsHasPhone: !!contact.phone,
        seniorityLevel: enrichmentData.seniorityLevel || null,
        jobTitle: enrichmentData.jobTitle || null,
      };

      await clayClient.enrichSingle(payload);

      await prisma.contact.update({
        where: { id: contactId },
        data: { clayEnrichedAt: new Date() },
      });

      logger.info({ contactId }, 'Contact sent to Clay for enrichment');
      return { success: true };
    } catch (error: any) {
      logger.error({ contactId, error: error.message }, 'Clay enrichment failed');
      return { success: false, error: error.message };
    }
  }

  async bulkEnrichContacts(contactIds: string[]): Promise<{
    total: number;
    sent: number;
    errors: string[];
  }> {
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      include: { company: true },
    });

    const payloads: ClayEnrichPayload[] = contacts.map(c => {
      const ed = (c as any).enrichmentData || {};
      return {
        contactId: c.id,
        email: c.email || null,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        companyName: c.company?.name || null,
        companyDomain: c.company?.domain || null,
        permitType: (c as any).permitType || null,
        permitCity: (c as any).permitCity || null,
        shovelsHasEmail: !!c.email,
        shovelsHasPhone: !!c.phone,
        seniorityLevel: ed.seniorityLevel || null,
        jobTitle: ed.jobTitle || null,
      };
    });

    const errors: string[] = [];
    try {
      await clayClient.enrichContacts(payloads);
      await prisma.contact.updateMany({
        where: { id: { in: contactIds } },
        data: { clayEnrichedAt: new Date() },
      });
    } catch (err: any) {
      errors.push(err.message);
    }

    return { total: contacts.length, sent: payloads.length, errors };
  }

  async handleWebhookCallback(payload: ClayWebhookPayload): Promise<void> {
    const { contactId, email, phone } = payload;

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, email: true, phone: true },
    });

    if (!contact) {
      logger.warn({ contactId }, 'Clay webhook: contact not found');
      return;
    }

    const updates: any = {
      clayEnrichedAt: new Date(),
      clayEnrichmentStatus: (email || contact.email) ? 'ENRICHED' : 'INCOMPLETE',
    };

    if (email && !contact.email) updates.email = email;
    if (phone && !contact.phone) updates.phone = phone;

    await prisma.contact.update({ where: { id: contactId }, data: updates });

    logger.info({ contactId, status: updates.clayEnrichmentStatus }, 'Clay webhook processed');
  }
}

export const clayEnrichmentService = new ClayEnrichmentService();
