/**
 * Error Notifier
 * Send email notifications when jobs fail
 * Day 8: Daily Automation
 */

import { ghlClient } from '../integrations/ghl/client';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface JobErrorData {
  jobType: string;
  jobId: string;
  error: string;
  affectedRecords?: number;
  timestamp: Date;
  metadata?: any;
}

export class ErrorNotifier {
  /**
   * Send error notification email to team
   */
  async notifyJobError(data: JobErrorData): Promise<boolean> {
    if (!config.notifications.email) {
      logger.warn('NOTIFICATION_EMAIL not configured - skipping error notification');
      return false;
    }

    try {
      logger.info({ jobType: data.jobType, jobId: data.jobId }, 'Sending job error notification');

      const subject = `❌ Job Failed: ${data.jobType}`;
      const htmlBody = this.buildErrorEmailHtml(data);
      const textBody = this.buildErrorEmailText(data);

      await ghlClient.sendEmail({
        to: config.notifications.email,
        subject,
        html: htmlBody,
        body: textBody,
      });

      logger.info({ jobId: data.jobId }, 'Job error notification sent');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message, jobId: data.jobId }, 'Failed to send job error notification');
      return false;
    }
  }

  /**
   * Build HTML email for job errors
   */
  private buildErrorEmailHtml(data: JobErrorData): string {
    const formattedDate = data.timestamp.toLocaleString('en-US', {
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
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
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
      border-bottom: 3px solid #EF4444;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #EF4444;
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
      padding: 8px 0;
    }
    .info-label {
      font-weight: 600;
      color: #4B5563;
    }
    .info-value {
      color: #1F2937;
    }
    .error-box {
      background-color: #FEE2E2;
      border-left: 4px solid #EF4444;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
      font-family: monospace;
      color: #991B1B;
      word-break: break-word;
    }
    .actions {
      background-color: #FEF3C7;
      border-left: 4px solid #F59E0B;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .actions ul {
      margin: 5px 0;
      padding-left: 20px;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #E5E7EB;
      color: #6B7280;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Job Failed: ${this.escapeHtml(data.jobType)}</h1>
    </div>

    <div class="section">
      <div class="section-title">📋 Job Details</div>
      <div class="info-row">
        <span class="info-label">Job Type:</span>
        <span class="info-value">${this.escapeHtml(data.jobType)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Job ID:</span>
        <span class="info-value">${this.escapeHtml(data.jobId)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Failed At:</span>
        <span class="info-value">${formattedDate}</span>
      </div>
      ${data.affectedRecords ? `
      <div class="info-row">
        <span class="info-label">Affected Records:</span>
        <span class="info-value">${data.affectedRecords}</span>
      </div>
      ` : ''}
    </div>

    <div class="section">
      <div class="section-title">❌ Error Message</div>
      <div class="error-box">
        ${this.escapeHtml(data.error)}
      </div>
    </div>

    <div class="section">
      <div class="section-title">🔧 Recommended Actions</div>
      <div class="actions">
        <ul>
          <li>Check server logs for detailed stack trace</li>
          <li>Verify API credentials and rate limits</li>
          <li>Check database connectivity</li>
          <li>Review job configuration and parameters</li>
          <li>Try running the job manually via API endpoint</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      <p>James Automation System - Job Error Alert</p>
      <p style="font-size: 12px; color: #9CA3AF;">
        This is an automated notification for failed daily automation jobs.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text email for job errors
   */
  private buildErrorEmailText(data: JobErrorData): string {
    const formattedDate = data.timestamp.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ JOB FAILED: ${data.jobType}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 JOB DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Job Type: ${data.jobType}
Job ID: ${data.jobId}
Failed At: ${formattedDate}
${data.affectedRecords ? `Affected Records: ${data.affectedRecords}\n` : ''}

❌ ERROR MESSAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.error}

🔧 RECOMMENDED ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Check server logs for detailed stack trace
• Verify API credentials and rate limits
• Check database connectivity
• Review job configuration and parameters
• Try running the job manually via API endpoint

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
James Automation System - Job Error Alert
    `.trim();
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
}

export const errorNotifier = new ErrorNotifier();

