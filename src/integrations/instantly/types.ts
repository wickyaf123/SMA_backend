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
 * Webhook event types (Instantly uses underscore format)
 */
export type InstantlyWebhookEvent =
  | 'email_sent'
  | 'email_delivered'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'
  | 'email_unsubscribed';

/**
 * Instantly webhook payload - FLAT structure (not nested)
 * All fields are at the root level
 */
export interface InstantlyWebhookPayload {
  // Event info
  event_type: InstantlyWebhookEvent;
  timestamp: string;
  
  // Lead/contact info
  email: string;
  lead_email?: string;
  firstName?: string;
  lastName?: string;
  
  // Campaign info
  campaign_id: string;
  campaign?: string; // Same as campaign_id
  campaign_name?: string;
  
  // Email details
  email_id?: string;
  email_subject?: string;
  email_html?: string;
  email_account?: string;
  
  // Company info
  companyName?: string;
  companyDomain?: string;
  companyWebsite?: string;
  companyDescription?: string;
  companyHeadCount?: string;
  
  // Professional info
  jobTitle?: string;
  jobLevel?: string;
  department?: string;
  industry?: string;
  subIndustry?: string;
  linkedIn?: string;
  headline?: string;
  summary?: string;
  location?: string;
  
  // Step/sequence info
  step?: number;
  variant?: number;
  is_first?: boolean;
  
  // Reply-specific fields
  reply_text?: string;
  reply_from?: string;
  reply_from_name?: string;
  message_id?: string;
  subject?: string;
  original_subject?: string;
  
  // Bounce-specific fields
  bounce_reason?: string;
  
  // Workspace
  workspace?: string;
  
  // Allow any additional fields
  [key: string]: any;
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

