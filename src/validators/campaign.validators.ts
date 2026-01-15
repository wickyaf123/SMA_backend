import { z } from 'zod';

/**
 * Create Campaign Schema
 */
export const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Campaign name is required').max(100, 'Campaign name too long'),
    channel: z.enum(['EMAIL', 'SMS', 'LINKEDIN'], {
      errorMap: () => ({ message: 'Channel must be EMAIL, SMS, or LINKEDIN' }),
    }),
    instantlyCampaignId: z.string().optional(),
    phantomBusterId: z.string().optional(),
    googleSheetUrl: z.string().url('Invalid Google Sheet URL').optional(),
    description: z.string().max(1000, 'Description too long').optional(),
    settings: z.record(z.any()).optional(),
  }).refine(
    (data) => {
      // Email campaigns must have instantlyCampaignId
      if (data.channel === 'EMAIL' && !data.instantlyCampaignId) {
        return false;
      }
      // LinkedIn campaigns must have googleSheetUrl
      if (data.channel === 'LINKEDIN' && !data.googleSheetUrl) {
        return false;
      }
      return true;
    },
    {
      message: 'EMAIL campaigns require instantlyCampaignId, LINKEDIN campaigns require googleSheetUrl',
    }
  ),
});

/**
 * Update Campaign Schema
 */
export const updateCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
    instantlyCampaignId: z.string().optional(),
    phantomBusterId: z.string().optional(),
    googleSheetUrl: z.string().url().optional(),
    description: z.string().max(1000).optional(),
    settings: z.record(z.any()).optional(),
  }),
});

/**
 * Get Campaign Schema
 */
export const getCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
});

/**
 * List Campaigns Schema
 */
export const listCampaignsSchema = z.object({
  query: z.object({
    channel: z.enum(['EMAIL', 'SMS', 'LINKEDIN']).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
    limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional(),
    offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
  }).optional(),
});

/**
 * Delete Campaign Schema
 */
export const deleteCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
});

/**
 * Enroll Contacts Schema
 */
export const enrollContactsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
  body: z.object({
    contactIds: z
      .array(z.string().uuid('Invalid contact ID'))
      .min(1, 'At least one contact ID is required')
      .max(100, 'Cannot enroll more than 100 contacts at once'),
    options: z
      .object({
        skipIfInWorkspace: z.boolean().optional(),
        skipIfInCampaign: z.boolean().optional(),
        customVariables: z.record(z.string()).optional(),
        customFields: z.record(z.string()).optional(),
        clearExisting: z.boolean().optional(),
      })
      .optional(),
  }),
});

/**
 * Stop Enrollment Schema
 */
export const stopEnrollmentSchema = z.object({
  params: z.object({
    campaignId: z.string().uuid('Invalid campaign ID'),
    contactId: z.string().uuid('Invalid contact ID'),
  }),
  body: z
    .object({
      reason: z.string().max(500).optional(),
    })
    .optional(),
});

/**
 * Get Enrollments Schema
 */
export const getEnrollmentsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
  query: z.object({
    status: z.enum(['ENROLLED', 'SENT', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'STOPPED', 'UNSUBSCRIBED']).optional(),
    limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional(),
    offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
  }).optional(),
});

/**
 * Send SMS Schema
 */
export const sendSMSSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid contact ID'),
  }),
  body: z.object({
    message: z.string().min(1, 'Message is required').max(480, 'Message too long (max 480 chars)'),
    variables: z.record(z.string()).optional(),
  }),
});

/**
 * Preview SMS Schema
 */
export const previewSMSSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid contact ID'),
  }),
  body: z.object({
    message: z.string().min(1, 'Message is required'),
    variables: z.record(z.string()).optional(),
  }),
});

