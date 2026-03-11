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
        const vars = permitPersonalizationService.buildVariables(contact);

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

    await axios.post(
      `${config.ghl.baseUrl}/contacts/`,
      {
        email: contact.email,
        phone: contact.phone,
        firstName: contact.firstName,
        lastName: contact.lastName,
        name: contact.fullName,
        tags: [`permit:${contact.permitType}`, `city:${contact.permitCity}`],
      },
      {
        headers: { Authorization: `Bearer ${config.ghl.apiKey}` },
        timeout: 15000,
      }
    );
  }
}

export const permitRoutingService = new PermitRoutingService();
