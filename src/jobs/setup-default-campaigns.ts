/**
 * Setup Default Campaigns Script
 * Creates default Email and SMS campaigns for auto-enrollment
 * Day 8: Daily Automation
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export async function setupDefaultCampaigns(): Promise<{
  emailCampaignId: string;
  smsCampaignId: string;
}> {
  logger.info('Setting up default campaigns for auto-enrollment');

  try {
    // Create Email Campaign
    const emailCampaign = await prisma.campaign.create({
      data: {
        name: 'Daily Auto-Enroll - Email',
        channel: 'EMAIL',
        status: 'ACTIVE',
        description: 'Automated daily email enrollment campaign',
        linkedinEnabled: false, // Not using LinkedIn
      },
    });

    logger.info({ campaignId: emailCampaign.id }, 'Email campaign created');

    // Create SMS Campaign
    const smsCampaign = await prisma.campaign.create({
      data: {
        name: 'Daily Auto-Enroll - SMS',
        channel: 'SMS',
        status: 'ACTIVE',
        description: 'Automated daily SMS enrollment campaign',
        linkedinEnabled: false, // Not using LinkedIn
      },
    });

    logger.info({ campaignId: smsCampaign.id }, 'SMS campaign created');

    // Update Settings with campaign IDs
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        linkedinGloballyEnabled: false, // Disable LinkedIn globally
        defaultEmailCampaignId: emailCampaign.id,
        defaultSmsCampaignId: smsCampaign.id,
      },
      update: {
        defaultEmailCampaignId: emailCampaign.id,
        defaultSmsCampaignId: smsCampaign.id,
        linkedinGloballyEnabled: false, // Ensure LinkedIn is disabled
      },
    });

    logger.info({ settings }, 'Settings updated with default campaign IDs');

    return {
      emailCampaignId: emailCampaign.id,
      smsCampaignId: smsCampaign.id,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to setup default campaigns');
    throw error;
  }
}

// Allow running as standalone script
if (require.main === module) {
  setupDefaultCampaigns()
    .then((result) => {
      console.log('✅ Default campaigns created successfully:');
      console.log(`  Email Campaign ID: ${result.emailCampaignId}`);
      console.log(`  SMS Campaign ID: ${result.smsCampaignId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to create default campaigns:', error.message);
      process.exit(1);
    });
}

