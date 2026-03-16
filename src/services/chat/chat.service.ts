import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import { toolDefinitions, executeTool } from './tools';
import { JERRY_SYSTEM_PROMPT } from './system-prompt';

const MAX_HISTORY_MESSAGES = 50;
const MODEL = 'claude-sonnet-4-20250514';

export class ChatService {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      if (!config.anthropic.apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
    return this.client;
  }

  async createConversation(title?: string): Promise<any> {
    const conversation = await prisma.conversation.create({
      data: { title: title || 'New Chat' },
    });
    logger.info({ conversationId: conversation.id }, 'Created new conversation');
    return conversation;
  }

  async listConversations(): Promise<any[]> {
    return prisma.conversation.findMany({
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

  async getConversation(id: string): Promise<any> {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    return conversation;
  }

  async deleteConversation(id: string): Promise<void> {
    await prisma.conversation.delete({ where: { id } });
    logger.info({ conversationId: id }, 'Deleted conversation');
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
    try {
      // 1. Save user message to DB
      await prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: userMessage,
        },
      });

      // 2. Load conversation history (newest N messages, then reverse to chronological order)
      const historyDesc = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: MAX_HISTORY_MESSAGES,
      });
      const history = historyDesc.reverse();

      // 3. Build Claude messages from history
      const claudeMessages: Anthropic.MessageParam[] = [];
      for (const msg of history) {
        if (msg.role === 'user') {
          claudeMessages.push({ role: 'user', content: msg.content });
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
      let fullResponse = '';
      let continueLoop = true;
      let streamedText = '';

      while (continueLoop) {
        continueLoop = false;

        const stream = this.getClient().messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system: JERRY_SYSTEM_PROMPT,
          messages: claudeMessages,
          tools,
        });

        let currentToolCalls: any[] = [];
        streamedText = '';

        // Use event-based streaming
        stream.on('text', (text) => {
          streamedText += text;
          fullResponse += text;
          if (onToken) onToken(text);
        });

        stream.on('error', (error) => {
          logger.error({ error, conversationId }, 'Stream error from Anthropic');
        });

        const finalMessage = await stream.finalMessage();

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
      const savedMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: fullResponse || streamedText,
        },
      });

      // 7. Auto-generate title if this is the first exchange
      const messageCount = await prisma.message.count({ where: { conversationId } });
      if (messageCount <= 3) {
        // Generate a short title from the first user message
        const title = userMessage.length > 50 ? userMessage.substring(0, 50) + '...' : userMessage;
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title },
        });
      }

      // Update conversation updatedAt
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      if (onDone) onDone(fullResponse);

      return savedMessage;
    } catch (error: any) {
      logger.error({ error, conversationId }, 'Error in sendMessage');
      if (onError) onError(error.message || 'An error occurred');
      throw error;
    }
  }
}

export const chatService = new ChatService();
