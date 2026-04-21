import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import { NotFoundError, RateLimitError, ValidationError } from '../../utils/errors';
import { runLangGraphTurn, resumeLangGraphConfirmation } from './agent/engine';

/** Classify protocol prefixes so the Prisma message row has accurate metadata. */
function inferProtocolMetadata(userMessage: string): any {
  if (userMessage.startsWith('BUTTON:')) return { type: 'protocol_button', raw: userMessage };
  if (userMessage.startsWith('CONFIRM:')) return { type: 'protocol_confirm', raw: userMessage };
  if (userMessage.startsWith('FORM:')) return { type: 'protocol_form', raw: userMessage };
  if (userMessage.startsWith('SYSTEM_EVENT:')) return { type: 'protocol_system_event', raw: userMessage };
  return { type: 'user' };
}

export class ChatService {
  private client: Anthropic | null = null;
  private activeStreams: Map<string, AbortController> = new Map();

  private getClient(): Anthropic {
    if (!this.client) {
      if (!config.anthropic.apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
    return this.client;
  }

  async createConversation(title: string | undefined, userId: string): Promise<any> {
    if (!userId) {
      throw new ValidationError('userId is required to create a conversation');
    }
    const conversation = await prisma.conversation.create({
      data: {
        title: title || 'New Chat',
        userId,
      },
    });
    logger.info({ conversationId: conversation.id, userId }, 'Created new conversation');
    return conversation;
  }

  async listConversations(userId: string): Promise<any[]> {
    if (!userId) {
      throw new ValidationError('userId is required to list conversations');
    }
    return prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });
  }

  async getConversation(id: string, userId: string): Promise<any> {
    if (!userId) {
      throw new ValidationError('userId is required to load a conversation');
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundError('Conversation', id);
    }
    return conversation;
  }

  async deleteConversation(id: string, userId: string): Promise<void> {
    if (!userId) {
      throw new ValidationError('userId is required to delete a conversation');
    }
    const result = await prisma.conversation.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundError('Conversation', id);
    }
    logger.info({ conversationId: id, userId }, 'Deleted conversation');
  }

  async searchConversations(query: string, userId: string): Promise<any[]> {
    if (!userId) {
      throw new ValidationError('userId is required to search conversations');
    }
    if (!query || query.trim().length === 0) return [];

    const messageWhere: any = {
      content: {
        contains: query,
        mode: 'insensitive',
      },
      role: { in: ['user', 'assistant'] },
      conversation: { userId },
    };

    const results = await prisma.message.findMany({
      where: messageWhere,
      select: {
        id: true,
        content: true,
        role: true,
        conversationId: true,
        createdAt: true,
        conversation: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Group by conversation, keep first matching message as snippet
    const conversationMap = new Map<string, any>();
    for (const msg of results) {
      if (!conversationMap.has(msg.conversationId)) {
        // Create snippet: show ~100 chars around the match
        const idx = msg.content.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, idx - 50);
        const end = Math.min(msg.content.length, idx + query.length + 50);
        const snippet = (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '');

        conversationMap.set(msg.conversationId, {
          id: msg.conversation.id,
          title: msg.conversation.title,
          updatedAt: msg.conversation.updatedAt,
          matchingMessage: {
            id: msg.id,
            content: snippet,
            role: msg.role,
            createdAt: msg.createdAt,
          },
        });
      }
    }

    return Array.from(conversationMap.values());
  }

  async sendMessage(
    conversationId: string,
    userMessage: string,
    onToken?: (token: string) => void,
    onToolUse?: (toolName: string, toolInput: any, toolCallId?: string) => void,
    onToolResult?: (toolName: string, result: any, toolCallId?: string) => void,
    onDone?: (fullResponse: string) => void,
    onError?: (error: string) => void,
  ): Promise<any> {
    const abortController = new AbortController();
    this.activeStreams.set(conversationId, abortController);

    try {
      // Persist user message for UI history
      const messageMetadata = inferProtocolMetadata(userMessage);
      await prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: userMessage,
          metadata: messageMetadata,
        },
      });

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { userId: true },
      });

      // CONFIRM:<id>:<decision> — resume an interrupted graph run instead of
      // starting a new turn.
      let result: { finalText: string; interrupt: any };
      if (userMessage.startsWith('CONFIRM:')) {
        const parts = userMessage.split(':');
        const decision = (parts[2] === 'confirm' ? 'confirm' : 'cancel') as 'confirm' | 'cancel';
        const resumed = await resumeLangGraphConfirmation({
          conversationId,
          userId: conversation?.userId ?? null,
          decision,
          onToken,
        });
        result = { finalText: resumed.finalText, interrupt: null };
      } else {
        result = await runLangGraphTurn({
          conversationId,
          userId: conversation?.userId ?? null,
          userMessage,
          signal: abortController.signal,
          onToken,
          onToolUse,
          onToolResult,
        });
      }

      // Auto-title on first exchange (mirrors legacy behaviour)
      const messageCount = await prisma.message.count({ where: { conversationId } });
      if (messageCount <= 3 && result.finalText) {
        try {
          const titleResponse = await this.getClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 20,
            messages: [{
              role: 'user',
              content: `Generate a 3-6 word title for this conversation. Only output the title, nothing else.\n\nUser: ${userMessage}\nAssistant: ${result.finalText.substring(0, 200)}`,
            }],
          });
          const generatedTitle = (titleResponse.content[0] as any)?.text?.trim();
          if (generatedTitle) {
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { title: generatedTitle },
            });
          }
        } catch (err) {
          logger.warn({ err, conversationId }, 'LangGraph: failed to auto-title conversation');
        }
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      this.activeStreams.delete(conversationId);
      if (onDone) onDone(result.finalText);
      return { content: result.finalText, interrupt: result.interrupt };
    } catch (error: any) {
      this.activeStreams.delete(conversationId);

      // Abort errors are expected when the user cancels — emit partial done
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        if (onDone) onDone('');
        return { content: '', interrupt: null };
      }

      const status = error?.status || error?.error?.status;
      if (status === 429) {
        const userMsg = 'I\'m currently experiencing high demand. Please try again in a moment.';
        if (onError) onError(userMsg);
        throw new RateLimitError(userMsg);
      }
      logger.error({ error, conversationId }, 'LangGraph sendMessage failed');
      if (onError) onError(error.message || 'An error occurred');
      throw error;
    }
  }

  async cancelStream(conversationId: string): Promise<void> {
    const controller = this.activeStreams.get(conversationId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(conversationId);

      // Save partial response if any was accumulated
      logger.info({ conversationId }, 'Stream cancelled by user');
    }
  }
}

export const chatService = new ChatService();
