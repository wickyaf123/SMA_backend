import { Request, Response, NextFunction } from 'express';
import { chatService } from '../services/chat/chat.service';
import { getIO } from '../config/websocket';
import { logger } from '../utils/logger';
import { sendSuccess } from '../utils/response';
import { prisma } from '../config/database';

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

  async searchConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        sendSuccess(res, []);
        return;
      }
      const results = await chatService.searchConversations(q);
      sendSuccess(res, results);
    } catch (error) {
      next(error);
    }
  }

  async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: messageId } = req.params;
      const { rating, comment } = req.body;

      if (!rating || !['up', 'down'].includes(rating)) {
        res.status(400).json({ success: false, error: 'Rating must be "up" or "down"' });
        return;
      }

      const feedback = await prisma.messageFeedback.upsert({
        where: { messageId },
        create: { messageId, rating, comment: comment || null },
        update: { rating, comment: comment || null },
      });

      sendSuccess(res, feedback);
    } catch (error) {
      next(error);
    }
  }

  async getFeedbackSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [upCount, downCount, total] = await Promise.all([
        prisma.messageFeedback.count({ where: { rating: 'up' } }),
        prisma.messageFeedback.count({ where: { rating: 'down' } }),
        prisma.messageFeedback.count(),
      ]);
      sendSuccess(res, { total, up: upCount, down: downCount });
    } catch (error) {
      next(error);
    }
  }

  async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: conversationId } = req.params;

      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split('\n').filter(l => l.trim());

      if (lines.length < 2) {
        res.status(400).json({ success: false, error: 'CSV file is empty or has no data rows' });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const sampleRows = lines.slice(1, 4).map(line =>
        line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      );

      // Store parsed data in Redis with 30-min TTL
      const { redis } = await import('../config/redis');
      const dataKey = `csv-upload:${conversationId}`;
      await redis.set(dataKey, csvContent, 'EX', 1800); // 30 min TTL

      sendSuccess(res, {
        rowCount: lines.length - 1,
        columns: headers,
        sampleRows: sampleRows.slice(0, 3),
        storedKey: dataKey,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
