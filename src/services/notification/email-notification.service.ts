/**
 * Email Notification Service
 * Sends reply alerts to the team via GoHighLevel
 * 
 * Features:
 * - HTML email templates
 * - Contact and reply details
 * - Clickable links to GHL contact
 * - Campaign stop notifications
 * - Professional formatting
 */

import { ghlClient } from '../../integrations/ghl/client';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { OutreachChannel } from '@prisma/client';

interface ReplyNotificationData {
  contact: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    ghlContactId?: string | null;
  };
  reply: {
    id: string;
    channel: OutreachChannel;
    content: string | null;
    receivedAt: Date;
  };
  stoppedCampaigns: number;
}

export class EmailNotificationService {
  private notificationEmail: string | undefined;

  constructor() {
    this.notificationEmail = config.notifications.email;
    
    if (!this.notificationEmail) {
      logger.warn('NOTIFICATION_EMAIL not set - email notifications will be disabled');
    } else {
      logger.info({ email: this.notificationEmail }, 'Email notification service initialized');
    }
  }

  /**
   * Send reply notification email to team
   */
  async sendReplyNotification(data: ReplyNotificationData): Promise<boolean> {
    if (!this.notificationEmail) {
      logger.warn('Cannot send email notification - NOTIFICATION_EMAIL not configured');
      return false;
    }

    const { contact, reply, stoppedCampaigns } = data;

    try {
      logger.info(
        {
          contactId: contact.id,
          channel: reply.channel,
          notificationEmail: this.notificationEmail,
        },
        'Sending reply notification email'
      );

      // Build email subject
      const subject = this.buildSubject(contact, reply.channel);

      // Build HTML email body
      const htmlBody = this.buildHtmlEmail(data);

      // Build plain text fallback
      const textBody = this.buildPlainTextEmail(data);

      // Send email via GHL
      const result = await ghlClient.sendEmail({
        to: this.notificationEmail,
        subject,
        html: htmlBody,
        body: textBody,
        // Optional: Add reply-to if you want replies to go to a specific email
        // replyTo: 'replies@thelouisagency.com',
      });

      logger.info(
        {
          contactId: contact.id,
          emailId: result.emailId,
          status: result.status,
        },
        'Reply notification email sent successfully'
      );

      return true;
    } catch (error: any) {
      logger.error(
        {
          contactId: contact.id,
          error: error.message,
          stack: error.stack,
        },
        'Failed to send reply notification email'
      );
      return false;
    }
  }

  /**
   * Build email subject line
   */
  private buildSubject(
    contact: { fullName: string | null; companyName: string | null },
    channel: OutreachChannel
  ): string {
    const name = contact.fullName || 'Unknown Contact';
    const company = contact.companyName ? ` at ${contact.companyName}` : '';
    const channelEmoji = this.getChannelEmoji(channel);
    
    return `${channelEmoji} New ${channel} Reply from ${name}${company}`;
  }

  /**
   * Build HTML email body
   */
  private buildHtmlEmail(data: ReplyNotificationData): string {
    const { contact, reply, stoppedCampaigns } = data;
    
    const ghlLink = contact.ghlContactId
      ? `https://app.gohighlevel.com/location/${config.ghl.locationId}/contacts/detail/${contact.ghlContactId}`
      : null;

    const channelEmoji = this.getChannelEmoji(reply.channel);
    const formattedDate = reply.receivedAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 3px solid #4F46E5;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #4F46E5;
      margin: 0;
      font-size: 24px;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      border-bottom: 2px solid #E5E7EB;
      padding-bottom: 5px;
    }
    .info-row {
      display: flex;
      padding: 8px 0;
    }
    .info-label {
      font-weight: 600;
      color: #4B5563;
      min-width: 120px;
    }
    .info-value {
      color: #1F2937;
    }
    .reply-content {
      background-color: #F9FAFB;
      border-left: 4px solid #4F46E5;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
      font-style: italic;
      color: #374151;
    }
    .actions-taken {
      background-color: #ECFDF5;
      border-left: 4px solid #10B981;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .actions-taken ul {
      margin: 5px 0;
      padding-left: 20px;
    }
    .actions-taken li {
      color: #065F46;
      padding: 3px 0;
    }
    .button {
      display: inline-block;
      background-color: #4F46E5;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin: 10px 10px 10px 0;
      transition: background-color 0.2s;
    }
    .button:hover {
      background-color: #4338CA;
    }
    .button-secondary {
      background-color: #10B981;
    }
    .button-secondary:hover {
      background-color: #059669;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #E5E7EB;
      color: #6B7280;
      font-size: 14px;
    }
    .channel-badge {
      display: inline-block;
      background-color: #EEF2FF;
      color: #4F46E5;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>${channelEmoji} You Received a New Reply!</h1>
    </div>

    <!-- Contact Details -->
    <div class="section">
      <div class="section-title">📋 Contact Details</div>
      <div class="info-row">
        <div class="info-label">Name:</div>
        <div class="info-value">${this.escapeHtml(contact.fullName || 'Unknown')}</div>
      </div>
      ${contact.companyName ? `
      <div class="info-row">
        <div class="info-label">Company:</div>
        <div class="info-value">${this.escapeHtml(contact.companyName)}</div>
      </div>
      ` : ''}
      ${contact.phone ? `
      <div class="info-row">
        <div class="info-label">Phone:</div>
        <div class="info-value">${this.escapeHtml(contact.phone)}</div>
      </div>
      ` : ''}
      ${contact.email ? `
      <div class="info-row">
        <div class="info-label">Email:</div>
        <div class="info-value">${this.escapeHtml(contact.email)}</div>
      </div>
      ` : ''}
    </div>

    <!-- Reply Info -->
    <div class="section">
      <div class="section-title">💬 Reply Information</div>
      <div class="info-row">
        <div class="info-label">Channel:</div>
        <div class="info-value">
          <span class="channel-badge">${channelEmoji} ${reply.channel}</span>
        </div>
      </div>
      <div class="info-row">
        <div class="info-label">Received:</div>
        <div class="info-value">${formattedDate}</div>
      </div>
      ${reply.content ? `
      <div class="reply-content">
        "${this.escapeHtml(reply.content)}"
      </div>
      ` : '<div class="reply-content"><em>No message content</em></div>'}
    </div>

    <!-- Actions Taken -->
    <div class="section">
      <div class="section-title">🎯 Actions Taken</div>
      <div class="actions-taken">
        <ul>
          <li>✓ ${stoppedCampaigns} active campaign${stoppedCampaigns !== 1 ? 's' : ''} stopped</li>
          <li>✓ Contact marked as REPLIED</li>
          <li>✓ Reply saved to database</li>
        </ul>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="section">
      <div class="section-title">🔗 Quick Actions</div>
      ${ghlLink ? `
      <a href="${ghlLink}" class="button">View in GoHighLevel</a>
      ` : ''}
      ${contact.phone ? `
      <a href="tel:${contact.phone}" class="button button-secondary">Call ${contact.phone}</a>
      ` : ''}
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Sent by James Automation System</p>
      <p style="font-size: 12px; color: #9CA3AF;">
        This notification was sent because a contact replied to your outreach campaign.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text email body (fallback)
   */
  private buildPlainTextEmail(data: ReplyNotificationData): string {
    const { contact, reply, stoppedCampaigns } = data;
    
    const ghlLink = contact.ghlContactId
      ? `https://app.gohighlevel.com/location/${config.ghl.locationId}/contacts/detail/${contact.ghlContactId}`
      : null;

    const formattedDate = reply.receivedAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOU RECEIVED A NEW REPLY!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 CONTACT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${contact.fullName || 'Unknown'}
${contact.companyName ? `Company: ${contact.companyName}\n` : ''}${contact.phone ? `Phone: ${contact.phone}\n` : ''}${contact.email ? `Email: ${contact.email}\n` : ''}

💬 REPLY INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Channel: ${reply.channel}
Received: ${formattedDate}

Message:
${reply.content ? `"${reply.content}"` : '(No message content)'}

🎯 ACTIONS TAKEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ ${stoppedCampaigns} active campaign${stoppedCampaigns !== 1 ? 's' : ''} stopped
✓ Contact marked as REPLIED
✓ Reply saved to database

🔗 QUICK ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ghlLink ? `→ View in GoHighLevel: ${ghlLink}\n` : ''}${contact.phone ? `→ Call Contact: ${contact.phone}\n` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sent by James Automation System
    `.trim();
  }

  /**
   * Get emoji for channel type
   */
  private getChannelEmoji(channel: OutreachChannel): string {
    const emojis: Record<OutreachChannel, string> = {
      EMAIL: '📧',
      SMS: '📱',
      LINKEDIN: '💼',
    };
    return emojis[channel] || '💬';
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Test notification (useful for setup)
   */
  async sendTestNotification(): Promise<boolean> {
    if (!this.notificationEmail) {
      logger.warn('Cannot send test notification - NOTIFICATION_EMAIL not configured');
      return false;
    }

    logger.info({ email: this.notificationEmail }, 'Sending test notification');

    try {
      await ghlClient.sendEmail({
        to: this.notificationEmail,
        subject: '🧪 Test: James Automation Email Notifications',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #4F46E5;">✅ Email Notifications Working!</h2>
            <p>This is a test email from the James Automation System.</p>
            <p>If you're receiving this, your email notifications are configured correctly.</p>
            <hr style="margin: 20px 0; border: none; border-top: 2px solid #E5E7EB;">
            <p style="color: #6B7280; font-size: 14px;">
              Sent to: ${this.notificationEmail}<br>
              Time: ${new Date().toLocaleString()}
            </p>
          </div>
        `,
        body: `
✅ EMAIL NOTIFICATIONS WORKING!

This is a test email from the James Automation System.
If you're receiving this, your email notifications are configured correctly.

Sent to: ${this.notificationEmail}
Time: ${new Date().toLocaleString()}
        `,
      });

      logger.info('Test notification sent successfully');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to send test notification');
      return false;
    }
  }
}

// Export singleton instance
export const emailNotificationService = new EmailNotificationService();

