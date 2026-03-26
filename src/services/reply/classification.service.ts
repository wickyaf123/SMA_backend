/**
 * Reply Classification Service
 * Uses Claude Haiku tool_use structured output to classify inbound replies into actionable buckets.
 * Stores classification in the Reply.classification enum column (not rawPayload JSON).
 * Supports idempotent processing -- duplicate webhooks do not trigger re-classification.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ReplyClassification as PrismaReplyClassification } from '@prisma/client';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export type ReplyClassification = 'book_call' | 'more_info' | 'not_interested' | 'objection' | 'unknown';

export interface ClassificationResult {
  classification: ReplyClassification;
  confidence: number;
  reasoning: string;
}

/** Maps lowercase classification to Prisma enum value */
const CLASSIFICATION_TO_PRISMA: Record<ReplyClassification, PrismaReplyClassification> = {
  book_call: 'BOOK_CALL',
  more_info: 'MORE_INFO',
  not_interested: 'NOT_INTERESTED',
  objection: 'OBJECTION',
  unknown: 'UNKNOWN',
};

/** Maps Prisma enum value to lowercase classification */
const PRISMA_TO_CLASSIFICATION: Record<PrismaReplyClassification, ReplyClassification> = {
  BOOK_CALL: 'book_call',
  MORE_INFO: 'more_info',
  NOT_INTERESTED: 'not_interested',
  OBJECTION: 'objection',
  UNKNOWN: 'unknown',
};

/** New classification tag names per CONTEXT.md decisions */
const CLASSIFICATION_TAG_MAP: Record<string, string> = {
  book_call: 'hot_lead',
  more_info: 'warm_lead',
  not_interested: 'not_interested',
  objection: 'objection',
};

/** All classification-related tags (new + legacy) for dedup filtering */
const ALL_CLASSIFICATION_TAGS = new Set([
  'hot_lead',
  'warm_lead',
  'not_interested',
  'objection',
  // Legacy tags to clean up
  'reply:book-call',
  'reply:more-info',
  'reply:not-interested',
  'reply:objection',
]);

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

  /**
   * Classify a reply using Claude tool_use structured output.
   * Uses a single tool definition to force structured JSON via tool_use blocks.
   */
  async classifyReply(
    replyContent: string,
    context?: { contactName?: string; originalOutreach?: string }
  ): Promise<ClassificationResult> {
    try {
      const client = this.getClient();

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        tools: [
          {
            name: 'classify_reply',
            description: 'Classify a contractor reply into an actionable category',
            input_schema: {
              type: 'object' as const,
              properties: {
                classification: {
                  type: 'string',
                  enum: ['book_call', 'more_info', 'not_interested', 'objection'],
                  description: 'The classification category for the reply',
                },
                confidence: {
                  type: 'number',
                  description: 'Confidence score from 0.0 to 1.0',
                },
                reasoning: {
                  type: 'string',
                  description: 'Brief reason for the classification',
                },
              },
              required: ['classification', 'confidence', 'reasoning'],
            },
          },
        ],
        tool_choice: { type: 'any' as const },
        system: `You classify contractor reply emails/SMS into exactly one category.

Categories:
- "book_call": Wants to schedule a call or meeting (e.g., "Sure, when works?", "Let's talk", "Send me a link")
- "more_info": Wants more details before deciding (e.g., "What do you charge?", "Tell me more", "How does this work?")
- "not_interested": Declines or opts out (e.g., "Not interested", "Remove me", "Stop", "No thanks")
- "objection": Has a concern or pushback (e.g., "Too expensive", "Already have someone", "Bad timing")

Use the classify_reply tool to report your classification.`,
        messages: [
          {
            role: 'user',
            content: `Classify this contractor's reply:\n\n"${replyContent}"${context?.originalOutreach ? `\n\nOriginal outreach context: ${context.originalOutreach}` : ''}`,
          },
        ],
      });

      // Extract structured result from tool_use block
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUseBlock) {
        logger.warn('No tool_use block in classification response, falling back to unknown');
        return { classification: 'unknown', confidence: 0, reasoning: 'No tool_use block in response' };
      }

      const input = toolUseBlock.input as {
        classification?: string;
        confidence?: number;
        reasoning?: string;
      };

      const validCategories: ReplyClassification[] = ['book_call', 'more_info', 'not_interested', 'objection'];
      const classification: ReplyClassification = validCategories.includes(input.classification as ReplyClassification)
        ? (input.classification as ReplyClassification)
        : 'unknown';

      return {
        classification,
        confidence: typeof input.confidence === 'number' ? input.confidence : 0,
        reasoning: input.reasoning || '',
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Reply classification failed');
      return { classification: 'unknown', confidence: 0, reasoning: 'Classification failed: ' + error.message };
    }
  }

  /**
   * Classify a reply and store the result in the database.
   * Idempotent: returns early if reply is already classified.
   * Uses atomic updateMany with classification: null to prevent race conditions.
   */
  async classifyAndStoreReply(replyId: string): Promise<ClassificationResult> {
    const reply = await prisma.reply.findUnique({
      where: { id: replyId },
      include: { contact: true },
    });

    if (!reply) {
      throw new Error(`Reply ${replyId} not found`);
    }

    // IDEMPOTENCY: Already classified -- return existing result
    if (reply.classification !== null) {
      return {
        classification: PRISMA_TO_CLASSIFICATION[reply.classification] || 'unknown',
        confidence: 0,
        reasoning: 'Already classified',
      };
    }

    if (!reply.content) {
      return { classification: 'unknown', confidence: 0, reasoning: 'No reply content to classify' };
    }

    const result = await this.classifyReply(reply.content, {
      contactName: reply.contact?.fullName || reply.contact?.firstName || undefined,
    });

    // Atomic check-and-set: only update if classification is still null (prevents concurrent double-classification)
    const prismaClassification = CLASSIFICATION_TO_PRISMA[result.classification];
    const updated = await prisma.reply.updateMany({
      where: { id: replyId, classification: null },
      data: {
        classification: prismaClassification,
        classifiedAt: new Date(),
        isProcessed: true,
        processedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      // Another concurrent request already classified this reply
      return { ...result, reasoning: 'Already classified (concurrent)' };
    }

    // Execute routing actions after successful classification
    if (reply.contactId) {
      await this.executeRoutingActions(reply.contactId, result.classification, replyId, reply.channel);
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

  /**
   * Execute routing actions based on classification result.
   * Each action is wrapped in try/catch -- failures are logged but do not prevent classification storage.
   */
  private async executeRoutingActions(
    contactId: string,
    classification: ReplyClassification,
    replyId: string,
    channel?: string
  ): Promise<void> {
    // Add classification tag
    const tag = CLASSIFICATION_TAG_MAP[classification];
    if (tag) {
      try {
        await this.addClassificationTag(contactId, tag);
      } catch (error: any) {
        logger.error({ contactId, tag, error: error.message }, 'Failed to add classification tag (non-critical)');
      }
    }

    // Classification-specific routing
    switch (classification) {
      case 'book_call':
        try {
          await prisma.contact.update({
            where: { id: contactId },
            data: { status: 'ENGAGED' },
          });
        } catch (error: any) {
          logger.error({ contactId, error: error.message }, 'Failed to update contact status to ENGAGED (non-critical)');
        }
        break;

      case 'not_interested':
        try {
          // Import campaignService dynamically to avoid circular dependencies
          const { campaignService } = await import('../campaign/campaign.service');
          await campaignService.stopAllCampaigns(contactId, 'classified_not_interested');
        } catch (error: any) {
          logger.error({ contactId, error: error.message }, 'Failed to stop campaigns for not_interested (non-critical)');
        }
        break;
    }

    // Log activity for all classifications
    try {
      const descriptions: Record<string, string> = {
        book_call: 'Reply classified: book_call',
        more_info: 'Reply classified: more_info',
        not_interested: 'Reply classified: not_interested -- stopped all enrollments',
        objection: 'Reply classified: objection',
        unknown: 'Reply classified: unknown',
      };

      await prisma.activityLog.create({
        data: {
          contactId,
          action: 'reply_classified',
          channel: channel as any || undefined,
          description: descriptions[classification] || `Reply classified: ${classification}`,
          metadata: { classification, replyId } as any,
        },
      });
    } catch (error: any) {
      logger.error({ contactId, classification, error: error.message }, 'Failed to log classification activity (non-critical)');
    }
  }

  /**
   * Add a classification tag to a contact, removing any existing classification tags.
   * Handles dedup by reading current tags, filtering out old classification + legacy tags, then writing back.
   */
  private async addClassificationTag(contactId: string, newTag: string): Promise<void> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { tags: true },
    });

    if (!contact) return;

    // Remove any existing classification tags (both new and legacy)
    const cleanedTags = contact.tags.filter((t) => !ALL_CLASSIFICATION_TAGS.has(t));
    cleanedTags.push(newTag);

    await prisma.contact.update({
      where: { id: contactId },
      data: { tags: cleanedTags },
    });
  }
}

export const replyClassificationService = new ReplyClassificationService();
