import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import { NotFoundError, RateLimitError } from '../../utils/errors';
import { retryWithBackoff } from '../../utils/retry';
import { toolDefinitions, executeTool } from './tools/index';
import { JERRY_SYSTEM_PROMPT } from './system-prompt';

const MAX_HISTORY_MESSAGES = 50;
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_ITERATIONS = 10;

/**
 * Ensure jerry:confirm / jerry:form / jerry:buttons blocks are wrapped in
 * triple-backtick code fences. Claude sometimes omits the fences after a
 * tool-use round, which causes the frontend to render raw JSON.
 */
function ensureJerryBlocksFenced(content: string): string {
  return content.replace(
    /(?:^|\n)\s*jerry:(confirm|form|buttons)\s*\n(\s*\{[\s\S]*?\n\s*\})/gm,
    '\n```jerry:$1\n$2\n```',
  );
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

  async createConversation(title?: string, userId?: string): Promise<any> {
    const conversation = await prisma.conversation.create({
      data: {
        title: title || 'New Chat',
        ...(userId && { userId }),
      },
    });
    logger.info({ conversationId: conversation.id, userId }, 'Created new conversation');
    return conversation;
  }

  async listConversations(userId?: string): Promise<any[]> {
    const where: any = {};
    if (userId) {
      where.OR = [
        { userId },
        { userId: null },
      ];
    }

    return prisma.conversation.findMany({
      where,
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

  async getConversation(id: string, userId?: string): Promise<any> {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    if (userId && conversation.userId && conversation.userId !== userId) {
      throw new NotFoundError('Conversation not found');
    }
    // Adopt orphaned conversations: assign to the requesting user
    if (userId && !conversation.userId) {
      await prisma.conversation.update({
        where: { id },
        data: { userId },
      });
    }
    return conversation;
  }

  async deleteConversation(id: string, userId?: string): Promise<void> {
    const where: any = { id };
    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }

    const result = await prisma.conversation.deleteMany({ where });
    if (result.count === 0) {
      logger.warn({ conversationId: id }, 'Conversation not found for deletion, skipping');
      return;
    }
    logger.info({ conversationId: id }, 'Deleted conversation');
  }

  async searchConversations(query: string, userId?: string): Promise<any[]> {
    if (!query || query.trim().length === 0) return [];

    const messageWhere: any = {
      content: {
        contains: query,
        mode: 'insensitive',
      },
      role: { in: ['user', 'assistant'] },
    };
    if (userId) {
      messageWhere.conversation = {
        OR: [{ userId }, { userId: null }],
      };
    }

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
    onToolUse?: (toolName: string, toolInput: any) => void,
    onToolResult?: (toolName: string, result: any) => void,
    onDone?: (fullResponse: string) => void,
    onError?: (error: string) => void,
  ): Promise<any> {
    let fullResponse = '';
    let streamedText = '';

    try {
      // 1. Save user message to DB (TASK 4: detect protocol messages)
      let messageMetadata: any = { type: 'user' };
      if (userMessage.startsWith('BUTTON:')) {
        messageMetadata = { type: 'protocol_button', raw: userMessage };
      } else if (userMessage.startsWith('CONFIRM:')) {
        messageMetadata = { type: 'protocol_confirm', raw: userMessage };
      } else if (userMessage.startsWith('FORM:')) {
        messageMetadata = { type: 'protocol_form', raw: userMessage };
      } else if (userMessage.startsWith('SYSTEM_EVENT:')) {
        messageMetadata = { type: 'protocol_system_event', raw: userMessage };
      }

      await prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: userMessage,
          metadata: messageMetadata,
        },
      });

      // 2. Load conversation history (newest N messages, then reverse to chronological order)
      const historyDesc = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: MAX_HISTORY_MESSAGES,
      });
      const history = historyDesc.reverse();

      // TASK 6: Check if we need to summarize old messages
      const totalMessageCount = await prisma.message.count({ where: { conversationId } });
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { summary: true, lastSummarizedAtCount: true },
      });

      let conversationSummary = conversation?.summary || null;

      if (totalMessageCount > 40 && (!conversation?.lastSummarizedAtCount || totalMessageCount - conversation.lastSummarizedAtCount >= 20)) {
        // Summarize the oldest messages that are being dropped
        try {
          const oldestMessages = historyDesc.slice(Math.max(0, historyDesc.length - 20)); // last 20 of desc = oldest 20 in current window
          const messagesForSummary = oldestMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `${m.role}: ${m.content?.substring(0, 200)}`)
            .join('\n');

          if (messagesForSummary.length > 0) {
            const summaryResponse = await this.getClient().messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 300,
              messages: [{
                role: 'user',
                content: `Summarize this conversation context in ~100 words. Focus on key topics, decisions, and any pending actions:\n\n${messagesForSummary}`,
              }],
            });
            conversationSummary = (summaryResponse.content[0] as any)?.text?.trim() || null;

            if (conversationSummary) {
              await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                  summary: conversationSummary,
                  lastSummarizedAtCount: totalMessageCount,
                },
              });
            }
          }
        } catch (summaryError) {
          logger.warn({ error: summaryError, conversationId }, 'Failed to generate conversation summary');
        }
      }

      // 3. Build Claude messages from history
      const claudeMessages: Anthropic.MessageParam[] = [];

      // TASK 6: Inject conversation summary if available
      if (conversationSummary) {
        claudeMessages.push({
          role: 'user',
          content: `[Previous conversation context: ${conversationSummary}]`,
        });
        claudeMessages.push({
          role: 'assistant',
          content: 'I understand the previous context. How can I help you continue?',
        });
      }

      // TASK 4: Condense protocol messages when building Claude context
      for (const msg of history) {
        if (msg.role === 'user') {
          // Condense protocol messages for Claude context
          let content = msg.content;
          const meta = msg.metadata as any;
          if (meta?.type === 'protocol_button') {
            const parts = msg.content.split(':');
            content = `User selected: ${parts.slice(2).join(':')} for ${parts[1] || 'option'}`;
          } else if (meta?.type === 'protocol_confirm') {
            const parts = msg.content.split(':');
            content = `User confirmed: ${parts[2] || 'action'} for ${parts[1] || 'item'}`;
          } else if (meta?.type === 'protocol_form') {
            const parts = msg.content.split(':');
            const formId = parts[1] || 'form';
            try {
              const formData = JSON.parse(parts.slice(2).join(':'));
              content = `User submitted form "${formId}": ${JSON.stringify(formData)}`;
            } catch {
              content = `User submitted form "${formId}"`;
            }
          } else if (meta?.type === 'protocol_system_event') {
            const parts = msg.content.split(':');
            content = `System event (${parts[1] || 'unknown'}): ${parts.slice(2).join(':')}`;
          }
          claudeMessages.push({ role: 'user', content });
        } else if (msg.role === 'assistant') {
          // Reconstruct assistant message - may include tool calls
          const contentBlocks: Anthropic.ContentBlockParam[] = [];
          if (msg.content) {
            contentBlocks.push({ type: 'text', text: msg.content });
          }
          if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            for (const tc of msg.toolCalls as any[]) {
              contentBlocks.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.input,
              });
            }
          }
          if (contentBlocks.length > 0) {
            claudeMessages.push({ role: 'assistant', content: contentBlocks });
          }
        } else if (msg.role === 'tool_result') {
          // Tool results
          if (msg.toolResults && Array.isArray(msg.toolResults)) {
            const toolResultBlocks: Anthropic.ToolResultBlockParam[] = (msg.toolResults as any[]).map((tr: any) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.tool_use_id,
              content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
            }));
            claudeMessages.push({ role: 'user', content: toolResultBlocks });
          }
        }
      }

      // 4. Build tools for Claude
      const tools: Anthropic.Tool[] = toolDefinitions.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      }));

      // 5. Stream response from Claude with tool-use loop
      fullResponse = '';
      let continueLoop = true;
      streamedText = '';
      let toolIterations = 0;

      const abortController = new AbortController();
      this.activeStreams.set(conversationId, abortController);

      while (continueLoop) {
        continueLoop = false;
        toolIterations++;

        // TASK 3: Tool loop guard
        if (toolIterations > MAX_TOOL_ITERATIONS) {
          logger.warn({ conversationId, iterations: toolIterations }, 'Tool loop guard triggered');
          claudeMessages.push({
            role: 'user',
            content: 'You have used too many tools in this turn. Please provide a final answer to the user without using any more tools.',
          });
          // Do one final call without tools to get the text response
          const finalStream = this.getClient().messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: JERRY_SYSTEM_PROMPT,
            messages: claudeMessages,
            // No tools - force text-only response
          }, { signal: abortController.signal });
          streamedText = '';
          finalStream.on('text', (text) => {
            streamedText += text;
            fullResponse += text;
            if (onToken) onToken(text);
          });
          await finalStream.finalMessage();
          break;
        }

        // TASK 2: Wrap stream creation + consumption in retry logic
        let currentToolCalls: any[] = [];
        const preRetryLength = fullResponse.length;

        const createAndConsumeStream = async () => {
          const stream = this.getClient().messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: JERRY_SYSTEM_PROMPT,
            messages: claudeMessages,
            tools,
          }, { signal: abortController.signal });

          // Reset for this attempt
          currentToolCalls = [];
          streamedText = '';

          stream.on('text', (text) => {
            streamedText += text;
            fullResponse += text;
            if (onToken) onToken(text);
          });

          stream.on('error', (error) => {
            logger.error({ error, conversationId }, 'Stream error from Anthropic');
          });

          return stream.finalMessage();
        };

        const finalMessage = await retryWithBackoff(createAndConsumeStream, {
          maxRetries: 3,
          baseDelay: 1000,
          shouldRetry: (error: any) => {
            const status = error?.status || error?.error?.status;
            if (status === 429 || status === 529 || status >= 500) return true;
            if (error?.error?.type === 'overloaded_error') return true;
            if (!status && error.message?.includes('fetch')) return true; // network error
            return false;
          },
          onRetry: (attempt, error) => {
            logger.warn({ attempt, error: error.message, conversationId }, 'Retrying Anthropic stream');
            // Undo partial text accumulated before the failed stream
            fullResponse = fullResponse.substring(0, preRetryLength);
          },
        });

        // Check for tool use in the response
        const toolUseBlocks = finalMessage.content.filter(
          (block): block is Anthropic.ContentBlock & { type: 'tool_use' } => block.type === 'tool_use'
        );

        if (toolUseBlocks.length > 0) {
          // Add assistant message with tool calls to conversation
          const assistantContent: Anthropic.ContentBlockParam[] = [];
          for (const block of finalMessage.content) {
            if (block.type === 'text') {
              assistantContent.push({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              assistantContent.push({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input as Record<string, unknown>,
              });
              currentToolCalls.push({
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }
          claudeMessages.push({ role: 'assistant', content: assistantContent });

          // Execute each tool
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const toolUse of toolUseBlocks) {
            logger.info({ tool: toolUse.name, input: toolUse.input }, 'Executing tool');
            if (onToolUse) onToolUse(toolUse.name, toolUse.input);

            try {
              const result = await executeTool(toolUse.name, toolUse.input as Record<string, any>, { conversationId });
              if (onToolResult) onToolResult(toolUse.name, result);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result),
              });
            } catch (toolError: any) {
              logger.error({ error: toolError, tool: toolUse.name }, 'Tool execution failed');
              if (onToolResult) onToolResult(toolUse.name, { success: false, error: toolError.message });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ success: false, error: toolError.message || 'Tool execution failed' }),
                is_error: true,
              });
            }
          }

          // Add tool results to messages
          claudeMessages.push({ role: 'user', content: toolResults });

          // Save tool-use assistant message
          await prisma.message.create({
            data: {
              conversationId,
              role: 'assistant',
              content: streamedText,
              toolCalls: currentToolCalls,
            },
          });

          // Save tool results
          await prisma.message.create({
            data: {
              conversationId,
              role: 'tool_result',
              content: '',
              toolResults: toolResults.map((tr) => ({
                tool_use_id: tr.tool_use_id,
                content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
              })) as any,
            },
          });

          fullResponse = ''; // Reset for final response after tool results
          continueLoop = true; // Continue the loop to get Claude's response after tool results
        }
      }

      // 6. Save final assistant message (text-only, NO tool calls — those were saved in the loop)
      // Use fullResponse (reset per-iteration) to avoid duplicating text from earlier tool-use rounds,
      // and sanitize any unfenced jerry:* blocks so the frontend can always parse them.
      const finalText = ensureJerryBlocksFenced(fullResponse || streamedText);
      const savedMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: finalText,
        },
      });

      // 7. Auto-generate title if this is the first exchange (TASK 5: AI-generated titles)
      const messageCount = await prisma.message.count({ where: { conversationId } });
      if (messageCount <= 3) {
        try {
          const titleResponse = await this.getClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 20,
            messages: [
              {
                role: 'user',
                content: `Generate a 3-6 word title for this conversation. Only output the title, nothing else.\n\nUser: ${userMessage}\nAssistant: ${finalText?.substring(0, 200)}`,
              },
            ],
          });
          const generatedTitle = (titleResponse.content[0] as any)?.text?.trim();
          if (generatedTitle && generatedTitle.length > 0) {
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { title: generatedTitle },
            });
          }
        } catch (titleError) {
          logger.warn({ error: titleError, conversationId }, 'Failed to generate AI title, using fallback');
          const title = userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage;
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { title },
          });
        }
      }

      // Update conversation updatedAt
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      this.activeStreams.delete(conversationId);

      if (onDone) onDone(finalText);

      return savedMessage;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        // Stream was cancelled by user - save partial response
        if (fullResponse || streamedText) {
          await prisma.message.create({
            data: {
              conversationId,
              role: 'assistant',
              content: (fullResponse || streamedText) + '\n\n*[Response cancelled]*',
            },
          });
        }
        this.activeStreams.delete(conversationId);
        if (onDone) onDone(fullResponse || streamedText || '');
        return null;
      }

      // Handle rate limit errors gracefully — operational error, won't be sent to Sentry
      const status = error?.status || error?.error?.status;
      if (status === 429) {
        logger.warn({ conversationId }, 'Claude API rate limit hit');
        const userMsg = 'I\'m currently experiencing high demand. Please try again in a moment.';
        if (onError) onError(userMsg);
        this.activeStreams.delete(conversationId);
        throw new RateLimitError(userMsg);
      }

      logger.error({ error, conversationId }, 'Error in sendMessage');
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
