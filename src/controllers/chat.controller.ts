import { Request, Response, NextFunction } from 'express';
import { chatService } from '../services/chat/chat.service';
import { getIO } from '../config/websocket';
import { logger } from '../utils/logger';
import { sendSuccess } from '../utils/response';

export class ChatController {
  async createConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title } = req.body;
      const conversation = await chatService.createConversation(title);
      sendSuccess(res, conversation, 201);
    } catch (error) {
      next(error);
    }
  }

  async listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversations = await chatService.listConversations();
      sendSuccess(res, conversations);
    } catch (error) {
      next(error);
    }
  }

  async getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversation = await chatService.getConversation(req.params.id);
      sendSuccess(res, conversation);
    } catch (error) {
      next(error);
    }
  }

  async deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await chatService.deleteConversation(req.params.id);
      sendSuccess(res, { deleted: true });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({ success: false, error: 'Message content is required' });
        return;
      }

      const io = getIO();
      const room = `chat:${id}`;

      const message = await chatService.sendMessage(
        id,
        content,
        // onToken - stream text to client
        (token: string) => {
          if (io) {
            io.to(room).emit('chat:token', { conversationId: id, token });
          }
        },
        // onToolUse - notify client about tool execution
        (toolName: string, toolInput: any) => {
          if (io) {
            io.to(room).emit('chat:tool_use', { conversationId: id, tool: toolName, input: toolInput });
          }
        },
        // onToolResult - send tool result to client
        (toolName: string, result: any) => {
          if (io) {
            io.to(room).emit('chat:tool_result', { conversationId: id, tool: toolName, result });
          }
        },
        // onDone - signal completion
        (fullResponse: string) => {
          if (io) {
            io.to(room).emit('chat:done', { conversationId: id });
          }
        },
        // onError
        (error: string) => {
          if (io) {
            io.to(room).emit('chat:error', { conversationId: id, error });
          }
        },
      );

      sendSuccess(res, message);
    } catch (error) {
      logger.error({ error, conversationId: req.params.id }, 'Error sending chat message');
      next(error);
    }
  }
}

export const chatController = new ChatController();
