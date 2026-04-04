import { prisma } from '../../config/database';
import { config } from '../../config';
import { permitPersonalizationService } from './personalization.service';
import { logger } from '../../utils/logger';
import axios from 'axios';

export class PermitRoutingService {
  async routeSearch(
    permitSearchId: string,
    routeMode?: 'email' | 'sms' | 'both'
  ): Promise<{ routed: number; failed: number }> {
    const settings = await prisma.settings.findFirst();
    const mode = routeMode || (settings as any)?.permitRouteMode || 'email';

    const contacts = await prisma.contact.findMany({
      where: {
        permitSearchId,
        clayEnrichmentStatus: { in: ['ENRICHED', 'SKIPPED'] },
        email: { not: null },
      },
      include: { company: true },
    });

    let routed = 0;
    let failed = 0;
    const campaignId = (settings as any)?.permitEmailCampaignId || config.instantly.campaignId;

    for (const contact of contacts) {
      try {
        const vars = permitPersonalizationService.buildContractorVariables(contact);

        if ((mode === 'email' || mode === 'both') && contact.email && campaignId) {
          await this.addToInstantlyCampaign(contact.email, campaignId, vars);
        }

        if ((mode === 'sms' || mode === 'both') && contact.phone) {
          const ghlWorkflowId = (settings as any)?.permitGhlWorkflowId;
          if (ghlWorkflowId && config.ghl.apiKey) {
            await this.enrollInGhlWorkflow(contact, ghlWorkflowId);
          }
        }

        routed++;
      } catch (err: any) {
        logger.error({ contactId: contact.id, error: err.message }, 'Failed to route permit contact');
        failed++;
      }
    }

    const smsFallbackEnabled = (settings as any)?.permitSmsFallbackEnabled ?? true;
    const ghlWorkflowId = (settings as any)?.permitGhlWorkflowId;
    const smsFallbackDelayDays = (settings as any)?.smsFallbackDelayDays ?? 5;

    // SMS fallback for contacts with no email but have phone (immediate)
    if (smsFallbackEnabled && ghlWorkflowId && config.ghl.apiKey) {
      const incompleteWithPhone = await prisma.contact.findMany({
        where: {
          permitSearchId,
          clayEnrichmentStatus: 'INCOMPLETE',
          phone: { not: null },
        },
        include: { company: true },
      });

      for (const contact of incompleteWithPhone) {
        try {
          await this.enrollInGhlWorkflow(contact, ghlWorkflowId);
          routed++;
        } catch (err: any) {
          logger.error({ contactId: contact.id, error: err.message }, 'Failed to SMS-fallback route permit contact');
          failed++;
        }
      }

      if (incompleteWithPhone.length > 0) {
        logger.info(
          { permitSearchId, smsFallbackCount: incompleteWithPhone.length },
          'SMS fallback routing complete for incomplete contacts'
        );
      }
    }

    // Email→SMS delay fallback: for contacts with BOTH email and phone,
    // schedule SMS fallback after smsFallbackDelayDays if no reply
    if (smsFallbackEnabled && ghlWorkflowId && config.ghl.apiKey && smsFallbackDelayDays > 0) {
      const dualChannelContacts = await prisma.contact.findMany({
        where: {
          permitSearchId,
          email: { not: null },
          phone: { not: null },
          clayEnrichmentStatus: { in: ['ENRICHED', 'SKIPPED'] },
        },
        select: { id: true },
      });

      if (dualChannelContacts.length > 0) {
        // Tag contacts for delayed SMS follow-up so the cron job can pick them up
        for (const contact of dualChannelContacts) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              tags: { push: 'sms_fallback_pending' },
              lastContactedAt: new Date(), // Mark when email was sent
            },
          });
        }

        logger.info(
          { permitSearchId, dualChannelCount: dualChannelContacts.length, delayDays: smsFallbackDelayDays },
          `Tagged ${dualChannelContacts.length} contacts for SMS fallback after ${smsFallbackDelayDays} days`
        );
      }
    }

    await prisma.permitSearch.update({
      where: { id: permitSearchId },
      data: { status: 'COMPLETED' },
    });

    logger.info({ permitSearchId, routed, failed, mode }, 'Permit search routing complete');
    return { routed, failed };
  }

  private async addToInstantlyCampaign(
    email: string,
    campaignId: string,
    variables: Record<string, any>
  ): Promise<void> {
    await axios.post(
      `${config.instantly.baseUrl}/lead/add`,
      {
        api_key: config.instantly.apiKey,
        campaign_id: campaignId,
        email,
        ...Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [`custom_${k}`, String(v)])
        ),
      },
      { timeout: 15000 }
    );
  }

  private async enrollInGhlWorkflow(contact: any, workflowId: string): Promise<void> {
    if (!config.ghl.apiKey || !config.ghl.locationId) return;

    const fields = config.ghl.fields;
    const enrichment = (contact.enrichmentData || {}) as Record<string, any>;
    const vars = permitPersonalizationService.buildContractorVariables(contact);

    const customFields = [
      fields.permitType && { id: fields.permitType, field_value: contact.permitType || '' },
      fields.permitDateFriendly && { id: fields.permitDateFriendly, field_value: vars.permit_date_friendly },
      fields.permitMonthsAgo && { id: fields.permitMonthsAgo, field_value: vars.permit_months_ago },
      fields.permitDescription && { id: fields.permitDescription, field_value: vars.permit_description },
      fields.avgJobValue && { id: fields.avgJobValue, field_value: vars.avg_job_value },
      fields.permitCount && { id: fields.permitCount, field_value: vars.permit_count },
      fields.revenue && { id: fields.revenue, field_value: vars.revenue },
      fields.reviewCount && { id: fields.reviewCount, field_value: vars.review_count },
      fields.propertyValue && { id: fields.propertyValue, field_value: permitPersonalizationService.formatCurrency(enrichment.propertyValue) },
      fields.incomeRange && { id: fields.incomeRange, field_value: enrichment.incomeRange || '' },
    ].filter(Boolean).filter((f: any) => f.field_value !== '');

    await axios.post(
      `${config.ghl.baseUrl}/contacts/`,
      {
        email: contact.email,
        phone: contact.phone,
        firstName: contact.firstName,
        lastName: contact.lastName,
        name: contact.fullName,
        address1: contact.address || contact.propertyAddress || undefined,
        tags: [`permit:${contact.permitType}`, `city:${contact.permitCity}`],
        customFields,
      },
      {
        headers: { Authorization: `Bearer ${config.ghl.apiKey}` },
        timeout: 15000,
      }
    );
  }
}

export const permitRoutingService = new PermitRoutingService();
