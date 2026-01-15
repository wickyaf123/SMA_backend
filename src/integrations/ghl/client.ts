/**
 * GoHighLevel API Client
 * Handles SMS sending, contact management, and conversation creation
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  GHLContactCreateRequest,
  GHLContactUpdateRequest,
  GHLContactResponse,
  GHLContactSearchResponse,
  GHLContactSearchParams,
  GHLConversationCreateRequest,
  GHLConversationResponse,
  GHLMessageCreateRequest,
  GHLMessageResponse,
  GHLEmailRequest,
  GHLEmailResponse,
  GHLPhoneNumbersResponse,
  GHLContact,
  GHLNoteResponse,
} from './types';

export class GoHighLevelClient {
  private api: AxiosInstance;
  private locationId: string;
  private phoneNumber?: string;

  constructor() {
    if (!config.ghl.apiKey) {
      throw new Error('GHL_API_KEY is not set in environment variables');
    }
    if (!config.ghl.locationId) {
      throw new Error('GHL_LOCATION_ID is not set in environment variables');
    }

    this.locationId = config.ghl.locationId;
    this.phoneNumber = config.ghl.phoneNumber;
    this.api = axios.create({
      baseURL: config.ghl.baseUrl,
      headers: {
        Authorization: `Bearer ${config.ghl.apiKey}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
    });

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error(
          {
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url,
            method: error.config?.method,
          },
          'GoHighLevel API error'
        );
        return Promise.reject(error);
      }
    );

    logger.info(
      { locationId: this.locationId, phoneNumber: this.phoneNumber },
      'GoHighLevel client initialized'
    );
  }

  // ==================== Contact Management ====================

  /**
   * Create a new contact in GoHighLevel
   */
  async createContact(
    contactData: Omit<GHLContactCreateRequest, 'locationId'>
  ): Promise<GHLContact> {
    logger.debug({ contactData }, 'Creating GHL contact');

    const payload: GHLContactCreateRequest = {
      ...contactData,
      locationId: this.locationId,
    };

    const response = await this.api.post<GHLContactResponse>('/contacts', payload);
    logger.info(
      { ghlContactId: response.data.contact.id },
      'GHL contact created successfully'
    );

    return response.data.contact;
  }

  /**
   * Update an existing contact in GoHighLevel
   */
  async updateContact(
    contactId: string,
    updates: Omit<Partial<GHLContactUpdateRequest>, 'id' | 'locationId'>
  ): Promise<GHLContact> {
    logger.debug({ contactId, updates }, 'Updating GHL contact');

    const response = await this.api.put<GHLContactResponse>(
      `/contacts/${contactId}`,
      updates
    );
    logger.info({ ghlContactId: contactId }, 'GHL contact updated successfully');

    return response.data.contact;
  }

  /**
   * Get a contact by ID
   */
  async getContact(contactId: string): Promise<GHLContact | null> {
    logger.debug({ contactId }, 'Fetching GHL contact');

    try {
      const response = await this.api.get<GHLContactResponse>(
        `/contacts/${contactId}`
      );
      return response.data.contact;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn({ contactId }, 'GHL contact not found');
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for contacts by email, phone, or query
   */
  async searchContacts(
    params: Omit<GHLContactSearchParams, 'locationId'>
  ): Promise<GHLContactSearchResponse> {
    logger.debug({ params }, 'Searching GHL contacts');

    const searchParams: GHLContactSearchParams = {
      ...params,
      locationId: this.locationId,
    };

    const response = await this.api.get<GHLContactSearchResponse>('/contacts', {
      params: searchParams,
    });

    logger.debug(
      { count: response.data.contacts.length },
      'GHL contacts search completed'
    );

    return response.data;
  }

  /**
   * Find contact by email or phone (helper method)
   * Uses 'query' parameter for GHL v2 API
   */
  async findContactByEmailOrPhone(
    email?: string,
    phone?: string
  ): Promise<GHLContact | null> {
    if (!email && !phone) {
      return null;
    }

    // GHL v2 API uses 'query' parameter for search
    // Try by email first
    if (email) {
      const emailResults = await this.searchContacts({ query: email, limit: 1 });
      if (emailResults.contacts.length > 0) {
        return emailResults.contacts[0];
      }
    }

    // Try by phone
    if (phone) {
      const phoneResults = await this.searchContacts({ query: phone, limit: 1 });
      if (phoneResults.contacts.length > 0) {
        return phoneResults.contacts[0];
      }
    }

    return null;
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string): Promise<void> {
    logger.debug({ contactId }, 'Deleting GHL contact');
    await this.api.delete(`/contacts/${contactId}`);
    logger.info({ contactId }, 'GHL contact deleted');
  }

  // ==================== Conversation Management ====================

  /**
   * Create a new conversation
   */
  async createConversation(
    contactId: string,
    type: 'SMS' | 'Email'
  ): Promise<GHLConversationResponse['conversation']> {
    logger.debug({ contactId, type }, 'Creating GHL conversation');

    const payload: GHLConversationCreateRequest = {
      locationId: this.locationId,
      contactId,
      type,
    };

    const response = await this.api.post<GHLConversationResponse>(
      '/conversations',
      payload
    );

    logger.info(
      { conversationId: response.data.conversation.id },
      'GHL conversation created'
    );

    return response.data.conversation;
  }

  /**
   * Get an existing conversation
   */
  async getConversation(conversationId: string) {
    logger.debug({ conversationId }, 'Fetching GHL conversation');
    const response = await this.api.get<GHLConversationResponse>(
      `/conversations/${conversationId}`
    );
    return response.data.conversation;
  }

  // ==================== Message Management ====================

  /**
   * Send an SMS message
   */
  async sendSMS(contactId: string, message: string): Promise<GHLMessageResponse> {
    logger.debug(
      { contactId, messageLength: message.length },
      'Sending SMS via GHL'
    );

    const payload: GHLMessageCreateRequest = {
      locationId: this.locationId,
      contactId,
      type: 'SMS',
      message,
    };

    const response = await this.api.post<GHLMessageResponse>(
      '/conversations/messages',
      payload
    );

    logger.info(
      {
        conversationId: response.data.conversationId,
        messageId: response.data.messageId,
      },
      'SMS sent via GHL'
    );

    return response.data;
  }

  /**
   * Send an email via GHL
   */
  async sendEmail(emailData: Omit<GHLEmailRequest, 'locationId'>): Promise<GHLEmailResponse> {
    logger.debug({ to: emailData.to, subject: emailData.subject }, 'Sending email via GHL');

    // Normalize 'to' field to array format
    const toArray = Array.isArray(emailData.to) ? emailData.to : [emailData.to];

    const payload: GHLEmailRequest = {
      ...emailData,
      to: toArray,
      locationId: this.locationId,
    };

    const response = await this.api.post<GHLEmailResponse>('/emails', payload);

    logger.info(
      { emailId: response.data.emailId, status: response.data.status },
      'Email sent via GHL'
    );

    return response.data;
  }

  // ==================== Phone Numbers ====================

  /**
   * Get all phone numbers for this location
   */
  async getPhoneNumbers(): Promise<GHLPhoneNumbersResponse> {
    logger.debug({ locationId: this.locationId }, 'Fetching GHL phone numbers');

    const response = await this.api.get<GHLPhoneNumbersResponse>(
      `/locations/${this.locationId}/phoneNumbers`
    );

    logger.debug(
      { count: response.data.phoneNumbers.length },
      'GHL phone numbers fetched'
    );

    return response.data;
  }

  /**
   * Get the primary SMS-capable phone number
   */
  async getPrimarySMSNumber(): Promise<string | null> {
    const { phoneNumbers } = await this.getPhoneNumbers();
    const smsNumber = phoneNumbers.find(
      (num) => num.capabilities.SMS && num.status === 'active'
    );

    if (!smsNumber) {
      logger.warn('No active SMS-capable phone number found in GHL');
      return null;
    }

    logger.debug({ number: smsNumber.formatted }, 'Found primary SMS number');
    return smsNumber.number;
  }

  /**
   * Get the configured phone number from env
   */
  getConfiguredPhoneNumber(): string | undefined {
    return this.phoneNumber;
  }

  // ==================== Notes Management ====================

  /**
   * Add a note to a contact
   * Use this to log external emails, activities, etc.
   * GHL API v2: POST /contacts/{contactId}/notes
   */
  async addContactNote(
    contactId: string,
    body: string
  ): Promise<GHLNoteResponse['note']> {
    logger.debug({ contactId, noteLength: body.length }, 'Adding note to GHL contact');

    // GHL v2 API format for notes
    const payload = {
      body,
      userId: undefined, // Optional - will use API key owner
    };

    try {
      const response = await this.api.post<GHLNoteResponse>(
        `/contacts/${contactId}/notes`,
        payload
      );

      logger.info(
        { contactId, noteId: response.data.note?.id },
        'Note added to GHL contact'
      );

      return response.data.note;
    } catch (error: any) {
      // Log detailed error for debugging
      logger.error(
        {
          contactId,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        },
        'Failed to add note to GHL contact'
      );
      throw error;
    }
  }

  // ==================== Tags Management ====================

  /**
   * Add tags to a contact
   * Alternative way to mark replies when notes API fails
   */
  async addContactTags(contactId: string, tags: string[]): Promise<GHLContact> {
    logger.debug({ contactId, tags }, 'Adding tags to GHL contact');

    try {
      const response = await this.api.post<GHLContactResponse>(
        `/contacts/${contactId}/tags`,
        { tags }
      );

      logger.info({ contactId, tags }, 'Tags added to GHL contact');
      return response.data.contact;
    } catch (error: any) {
      logger.error(
        { contactId, tags, error: error.response?.data || error.message },
        'Failed to add tags'
      );
      throw error;
    }
  }

  // ==================== Conversations ====================

  /**
   * Get conversation messages for a contact
   * GHL API v2: GET /conversations/search?contactId={contactId}
   * Then: GET /conversations/{conversationId}/messages
   */
  async getConversationMessages(ghlContactId: string): Promise<any[]> {
    logger.debug({ ghlContactId }, 'Fetching GHL conversation messages');

    try {
      // First, find conversations for this contact
      const searchResponse = await this.api.get('/conversations/search', {
        params: {
          locationId: this.locationId,
          contactId: ghlContactId,
        },
      });

      const conversations = searchResponse.data.conversations || [];

      if (conversations.length === 0) {
        logger.debug({ ghlContactId }, 'No conversations found for contact');
        return [];
      }

      // Get messages from the first (most recent) conversation
      const conversationId = conversations[0].id;
      const messagesResponse = await this.api.get(`/conversations/${conversationId}/messages`);

      const messages = messagesResponse.data.messages || [];
      
      logger.debug(
        { ghlContactId, conversationId, messageCount: messages.length },
        'GHL conversation messages fetched'
      );

      // Map to a simpler format
      return messages.map((msg: any) => ({
        id: msg.id,
        type: msg.type, // SMS, Email, etc.
        direction: msg.direction, // inbound, outbound
        body: msg.body,
        subject: msg.subject,
        status: msg.status,
        dateAdded: msg.dateAdded,
        from: msg.from,
        to: msg.to,
        attachments: msg.attachments,
      }));
    } catch (error: any) {
      logger.error(
        { ghlContactId, error: error.response?.data || error.message },
        'Failed to fetch GHL conversation messages'
      );
      throw error;
    }
  }
}

// Export singleton instance
export const ghlClient = new GoHighLevelClient();


