import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { ClayEnrichPayload } from './types';

export class ClayClient {
  async enrichContacts(contacts: ClayEnrichPayload[]): Promise<void> {
    if (!config.clay.tableUrl) {
      throw new Error('CLAY_TABLE_URL not configured');
    }
    const chunks = this.chunk(contacts, 20);
    for (const chunk of chunks) {
      await axios.post(config.clay.tableUrl, { rows: chunk }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
      await new Promise(r => setTimeout(r, 500));
    }
    logger.info({ count: contacts.length }, 'Sent contacts to Clay for enrichment');
  }

  async enrichSingle(contact: ClayEnrichPayload): Promise<void> {
    return this.enrichContacts([contact]);
  }

  validateWebhook(signature: string, rawBody: string): boolean {
    if (!config.clay.webhookSecret) return true;
    const expected = crypto
      .createHmac('sha256', config.clay.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return signature === `sha256=${expected}`;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );
  }
}

export const clayClient = new ClayClient();
