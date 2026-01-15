/**
 * Instantly API Type Definitions
 * API Docs: https://developer.instantly.ai/
 */

export interface InstantlyAddLeadRequest {
  api_key: string;
  campaign_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone_number?: string;
  website?: string;
  custom_variables?: Record<string, string>;
  skip_if_in_workspace?: boolean;
  skip_if_in_campaign?: boolean;
}

export interface InstantlyAddLeadResponse {
  status: 'success' | 'error';
  id?: string;
  email?: string;
  message?: string;
  error?: string;
}

export interface InstantlyGetCampaignEmailsRequest {
  api_key: string;
  campaign_id: string;
  limit?: number;
  skip?: number;
}

export interface InstantlyCampaignEmail {
  email: string;
  status: string;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
  bounced: boolean;
  unsubscribed: boolean;
  sent_at?: string;
  opened_at?: string;
  clicked_at?: string;
  replied_at?: string;
  bounced_at?: string;
}

export interface InstantlyGetCampaignEmailsResponse {
  emails: InstantlyCampaignEmail[];
  total: number;
}

/**
 * Webhook event types
 */
export type InstantlyWebhookEvent =
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.replied'
  | 'email.bounced'
  | 'email.unsubscribed';

export interface InstantlyWebhookPayload {
  event: InstantlyWebhookEvent;
  timestamp: string;
  data: {
    campaign_id: string;
    email: string;
    message_id?: string;
    reply_text?: string;
    reply_from?: string;
    reply_to?: string;
    bounce_reason?: string;
    [key: string]: any;
  };
}

export interface InstantlyConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Instantly Campaign (from API)
 */
export interface InstantlyCampaign {
  id: string;
  name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface InstantlyListCampaignsResponse {
  items: InstantlyCampaign[];
  next_starting_after?: string;
}

