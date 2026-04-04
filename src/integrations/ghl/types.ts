/**
 * GoHighLevel API Types
 * API Documentation: https://highlevel.stoplight.io/docs/integrations/
 */

// ==================== Contact Types ====================

export type GHLCustomField =
  | { key: string; field_value: string; id?: undefined }
  | { id: string; field_value: string; key?: undefined };

export interface GHLContactCreateRequest {
  locationId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  tags?: string[];
  source?: string;
  customFields?: GHLCustomField[];
}

export interface GHLContactUpdateRequest extends Partial<GHLContactCreateRequest> {
  id: string;
}

export interface GHLContact {
  id: string;
  locationId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  tags?: string[];
  source?: string;
  customFields?: GHLCustomField[];
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLContactResponse {
  contact: GHLContact;
}

export interface GHLContactSearchResponse {
  contacts: GHLContact[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Conversation Types ====================

export interface GHLConversation {
  id: string;
  locationId: string;
  contactId: string;
  type: 'SMS' | 'Email' | 'GMB' | 'FB' | 'IG' | 'WhatsApp';
  status: 'open' | 'closed';
  unreadCount: number;
  lastMessageDate?: string;
  lastMessageBody?: string;
}

export interface GHLConversationCreateRequest {
  locationId: string;
  contactId: string;
  type: 'SMS' | 'Email';
}

export interface GHLConversationResponse {
  conversation: GHLConversation;
}

// ==================== Message Types ====================

export interface GHLMessageCreateRequest {
  locationId: string;
  contactId: string;
  type: 'SMS' | 'Email';
  message?: string; // For SMS
  body?: string; // For Email
  subject?: string; // For Email only
  html?: string; // For Email (optional)
  attachments?: string[]; // URLs for Email
}

export interface GHLMessage {
  id: string;
  conversationId: string;
  contactId: string;
  locationId: string;
  type: 'SMS' | 'Email';
  body: string;
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
  updatedAt?: string;
  userId?: string;
  attachments?: string[];
}

export interface GHLMessageResponse {
  conversationId: string;
  messageId: string;
  message: GHLMessage;
}

// ==================== Webhook Types ====================

export interface GHLWebhookPayload {
  type: 'InboundMessage' | 'ConversationUnread' | 'OutboundMessage';
  locationId: string;
  contactId: string;
  conversationId: string;
  message: GHLMessage;
  timestamp?: string;
}

export interface GHLInboundMessagePayload extends GHLWebhookPayload {
  type: 'InboundMessage';
}

// ==================== Email Notification Types ====================

export interface GHLEmailRequest {
  locationId: string;
  to: string | string[]; // Support both single email and array
  from?: string;
  subject: string;
  html: string;
  body?: string; // Plain text fallback (some APIs call this 'text')
  text?: string; // Plain text fallback (alternative name)
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType: string;
  }>;
}

export interface GHLEmailResponse {
  emailId: string;
  status: 'queued' | 'sent' | 'failed';
}

// ==================== Phone Number Types ====================

export interface GHLPhoneNumber {
  id: string;
  locationId: string;
  number: string;
  formatted: string;
  capabilities: {
    SMS: boolean;
    MMS: boolean;
    Voice: boolean;
  };
  status: 'active' | 'inactive';
}

export interface GHLPhoneNumbersResponse {
  phoneNumbers: GHLPhoneNumber[];
}

// ==================== Error Types ====================

export interface GHLErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  meta?: Record<string, any>;
}

// ==================== Note/Activity Types ====================

export interface GHLNoteCreateRequest {
  locationId: string;
  contactId: string;
  body: string;
  userId?: string;
}

export interface GHLNoteResponse {
  note: {
    id: string;
    contactId: string;
    body: string;
    createdAt: string;
  };
}

// ==================== Inbound Message Types ====================

export interface GHLInboundMessageCreateRequest {
  type: 'Email' | 'Custom';
  contactId: string;
  conversationId?: string;
  conversationProviderId?: string;
  message: string;
  html?: string;
  subject?: string;
  attachments?: string[];
  direction?: 'inbound';
}

// ==================== Opportunity Types ====================

export interface CreateOpportunityPayload {
  pipelineId: string;
  stageId: string;
  contactId: string;     // GHL contact ID
  name: string;          // Opportunity name (e.g. "Solar Install - John Smith")
  monetaryValue?: number;
  status?: 'open' | 'won' | 'lost' | 'abandoned';
  assignedTo?: string;
}

export interface GHLOpportunity {
  id: string;
  name: string;
  monetaryValue: number;
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  status: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GHLOpportunityResponse {
  opportunity: GHLOpportunity;
}

// ==================== Utility Types ====================

export type GHLMessageType = 'SMS' | 'Email';

export interface GHLPaginationParams {
  limit?: number;
  offset?: number;
}

export interface GHLContactSearchParams extends GHLPaginationParams {
  locationId: string;
  email?: string;
  phone?: string;
  query?: string;
}


