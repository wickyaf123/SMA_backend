/**
 * Reply Classification Service
 * Uses Claude Haiku to classify inbound replies into actionable buckets.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export type ReplyClassification = 'book_call' | 'more_info' | 'not_interested' | 'objection' | 'unknown';

export interface ClassificationResult {
  classification: ReplyClassification;
  confidence: number;
  reasoning: string;
}

class ReplyClassificationService {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      if (!config.anthropic.apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required for reply classification');
      }
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
    return this.client;
  }

  async classifyReply(
    replyContent: string,
    context?: { contactName?: string; originalOutreach?: string }
  ): Promise<ClassificationResult> {
    try {
      const client = this.getClient();

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: `You classify contractor reply emails/SMS into exactly one category. Reply with ONLY valid JSON, no other text.

Categories:
- "book_call": Wants to schedule a call or meeting (e.g., "Sure, when works?", "Let's talk", "Send me a link")
- "more_info": Wants more details before deciding (e.g., "What do you charge?", "Tell me more", "How does this work?")
- "not_interested": Declines or opts out (e.g., "Not interested", "Remove me", "Stop", "No thanks")
- "objection": Has a concern or pushback (e.g., "Too expensive", "Already have someone", "Bad timing")

JSON format: {"classification": "...", "confidence": 0.0-1.0, "reasoning": "brief reason"}`,
        messages: [
          {
            role: 'user',
            content: `Classify this contractor's reply:\n\n"${replyContent}"${context?.originalOutreach ? `\n\nOriginal outreach context: ${context.originalOutreach}` : ''}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(text);

      const validCategories: ReplyClassification[] = ['book_call', 'more_info', 'not_interested', 'objection'];
      const classification = validCategories.includes(parsed.classification)
        ? parsed.classification
        : 'unknown';

      return {
        classification,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reasoning: parsed.reasoning || '',
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Reply classification failed');
      return { classification: 'unknown', confidence: 0, reasoning: 'Classification failed: ' + error.message };
    }
  }

  async classifyAndStoreReply(replyId: string): Promise<ClassificationResult> {
    const reply = await prisma.reply.findUnique({
      where: { id: replyId },
      include: { contact: true },
    });

    if (!reply) {
      throw new Error(`Reply ${replyId} not found`);
    }

    if (!reply.content) {
      return { classification: 'unknown', confidence: 0, reasoning: 'No reply content to classify' };
    }

    const result = await this.classifyReply(reply.content, {
      contactName: reply.contact?.fullName || reply.contact?.firstName || undefined,
    });

    // Store classification in reply rawPayload
    await prisma.reply.update({
      where: { id: replyId },
      data: {
        isProcessed: true,
        processedAt: new Date(),
        rawPayload: {
          ...((reply.rawPayload as any) || {}),
          classification: result,
        },
      },
    });

    // Tag contact based on classification
    if (reply.contactId) {
      const tagMap: Record<string, string> = {
        book_call: 'reply:book-call',
        more_info: 'reply:more-info',
        not_interested: 'reply:not-interested',
        objection: 'reply:objection',
      };

      const tag = tagMap[result.classification];
      if (tag) {
        const contact = await prisma.contact.findUnique({
          where: { id: reply.contactId },
          select: { tags: true },
        });
        if (contact && !contact.tags.includes(tag)) {
          // Remove any previous reply classification tags
          const cleanedTags = contact.tags.filter(t => !t.startsWith('reply:'));
          cleanedTags.push(tag);
          await prisma.contact.update({
            where: { id: reply.contactId },
            data: { tags: cleanedTags },
          });
        }
      }

      // Log activity
      await prisma.activityLog.create({
        data: {
          contactId: reply.contactId,
          action: 'reply_classified',
          channel: reply.channel,
          description: `Reply classified as "${result.classification}" (${Math.round(result.confidence * 100)}% confidence): ${result.reasoning}`,
          metadata: result as any,
        },
      });
    }

    logger.info(
      {
        replyId,
        contactId: reply.contactId,
        classification: result.classification,
        confidence: result.confidence,
      },
      'Reply classified'
    );

    return result;
  }
}

export const replyClassificationService = new ReplyClassificationService();
