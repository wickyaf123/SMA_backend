/**
 * WebSocket Server Configuration
 * Real-time event broadcasting to connected clients
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { config } from './index';
import { prisma } from './database';

let io: SocketIOServer | null = null;

/** Track which conversations each socket is actively observing. */
const socketConversations = new Map<string, Set<string>>();

/**
 * WebSocket event types for type safety
 */
export enum WSEventType {
  // Job events
  JOB_STARTED = 'job:started',
  JOB_PROGRESS = 'job:progress',
  JOB_COMPLETED = 'job:completed',
  JOB_FAILED = 'job:failed',
  JOB_PAUSED = 'job:paused',
  JOB_RESUMED = 'job:resumed',

  // Contact events
  CONTACT_CREATED = 'contact:created',
  CONTACT_UPDATED = 'contact:updated',
  CONTACT_VALIDATED = 'contact:validated',
  CONTACT_ENRICHED = 'contact:enriched',
  CONTACT_ENROLLED = 'contact:enrolled',

  // Reply events
  REPLY_RECEIVED = 'reply:received',

  // Campaign events
  CAMPAIGN_UPDATED = 'campaign:updated',
  CAMPAIGN_ENROLLMENT = 'campaign:enrollment',

  // Pipeline events
  PIPELINE_STATUS = 'pipeline:status',

  // Queue events
  QUEUE_STATUS = 'queue:status',

  // Metrics events
  METRICS_UPDATE = 'metrics:update',

  // System events
  SYSTEM_ALERT = 'system:alert',

  // Chat events
  CHAT_TOKEN = 'chat:token',
  CHAT_TOOL_USE = 'chat:tool_use',
  CHAT_TOOL_RESULT = 'chat:tool_result',
  CHAT_DONE = 'chat:done',
  CHAT_ERROR = 'chat:error',

  // Workflow events
  WORKFLOW_STARTED = 'workflow:started',
  WORKFLOW_STEP_STARTED = 'workflow:step_started',
  WORKFLOW_STEP_PROGRESS = 'workflow:step_progress',
  WORKFLOW_STEP_COMPLETED = 'workflow:step_completed',
  WORKFLOW_STEP_FAILED = 'workflow:step_failed',
  WORKFLOW_STEP_SKIPPED = 'workflow:step_skipped',
  WORKFLOW_COMPLETED = 'workflow:completed',
  WORKFLOW_FAILED = 'workflow:failed',
  WORKFLOW_CANCELLED = 'workflow:cancelled',
}

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.isDevelopment ? '*' : (process.env.FRONTEND_URL?.split(',').map(u => u.trim()) || []),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'WebSocket client connected');

    // Join default room for broadcast
    socket.join('dashboard');

    // Handle authentication (optional - for future multi-user support)
    socket.on('authenticate', (data: { apiKey?: string }) => {
      if (data.apiKey === config.apiKey) {
        socket.join('authenticated');
        socket.emit('authenticated', { success: true });
        logger.debug({ socketId: socket.id }, 'WebSocket client authenticated');
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid API key' });
      }
    });

    // Handle subscription to specific rooms/channels
    socket.on('subscribe', (room: string) => {
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Client subscribed to room');
    });

    socket.on('unsubscribe', (room: string) => {
      socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Client unsubscribed from room');
    });

    // Handle chat room subscription
    socket.on('chat:join', async (conversationId: string) => {
      const room = `chat:${conversationId}`;
      socket.join(room);
      if (!socketConversations.has(socket.id)) {
        socketConversations.set(socket.id, new Set());
      }
      socketConversations.get(socket.id)!.add(conversationId);
      logger.debug({ socketId: socket.id, room }, 'Client joined chat room');

      // Send active/recent job states so cards persist across page reloads
      try {
        const activeSearches = await prisma.permitSearch.findMany({
          where: {
            conversationId,
            OR: [
              { status: { in: ['PENDING', 'SEARCHING', 'ENRICHING'] } },
              {
                status: { in: ['READY_FOR_REVIEW', 'SHEET_WRITTEN', 'COMPLETED', 'FAILED', 'CANCELLED'] },
                updatedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        for (const search of activeSearches) {
          const isInProgress = ['PENDING', 'SEARCHING', 'ENRICHING'].includes(search.status);
          const isPending = search.status === 'PENDING';
          const isCancelled = search.status === 'CANCELLED';
          const isFailed = search.status === 'FAILED' || isCancelled;
          const event = isInProgress
            ? (isPending ? WSEventType.JOB_STARTED : WSEventType.JOB_PROGRESS)
            : isFailed
              ? WSEventType.JOB_FAILED
              : WSEventType.JOB_COMPLETED;

          socket.emit(event, {
            jobId: search.id,
            jobType: 'permit:search',
            status: isInProgress ? 'started' : isCancelled ? 'cancelled' : search.status === 'FAILED' ? 'failed' : 'completed',
            isReplay: true,
            result: {
              total: search.totalFound,
              enriched: search.totalEnriched,
              incomplete: search.totalIncomplete,
              sheetUrl: search.googleSheetUrl,
              permitType: search.permitType,
              city: search.city,
            },
            timestamp: new Date().toISOString(),
          });
        }

        if (activeSearches.length > 0) {
          logger.debug(
            { socketId: socket.id, conversationId, count: activeSearches.length },
            'Sent active job states on chat:join'
          );
        }
      } catch (err) {
        logger.error({ err, conversationId }, 'Failed to query active searches on chat:join');
      }
    });

    socket.on('chat:leave', (conversationId: string) => {
      const room = `chat:${conversationId}`;
      socket.leave(room);
      socketConversations.get(socket.id)?.delete(conversationId);
      logger.debug({ socketId: socket.id, room }, 'Client left chat room');
    });

    // Handle stream cancellation
    socket.on('chat:cancel', async (conversationId: string) => {
      logger.info({ socketId: socket.id, conversationId }, 'Client requested stream cancellation');
      try {
        const { chatService } = await import('../services/chat/chat.service');
        await chatService.cancelStream(conversationId);
        // Emit done event so frontend knows to stop showing streaming state
        const room = `chat:${conversationId}`;
        io?.to(room).emit('chat:done', { conversationId, cancelled: true });
      } catch (err) {
        logger.error({ err, conversationId }, 'Failed to cancel stream');
      }
    });

    socket.on('job:pause', (data: { jobId: string; conversationId: string }) => {
      logger.info({ socketId: socket.id, jobId: data.jobId }, 'Client requested job pause');
      const { pauseJob } = require('../services/scraper/shovels.service');
      pauseJob(data.jobId);
      const room = `chat:${data.conversationId}`;
      io?.to(room).emit(WSEventType.JOB_PAUSED, {
        jobId: data.jobId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('job:resume', (data: { jobId: string; conversationId: string }) => {
      logger.info({ socketId: socket.id, jobId: data.jobId }, 'Client requested job resume');
      const { resumeJob } = require('../services/scraper/shovels.service');
      resumeJob(data.jobId);
      const room = `chat:${data.conversationId}`;
      io?.to(room).emit(WSEventType.JOB_RESUMED, {
        jobId: data.jobId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('job:cancel', async (data: { jobId: string; conversationId: string }) => {
      logger.info({ socketId: socket.id, jobId: data.jobId }, 'Client requested job cancel');
      const { cancelJob, clearJobSignal } = require('../services/scraper/shovels.service');
      cancelJob(data.jobId);

      try {
        const search = await prisma.permitSearch.findUnique({ where: { id: data.jobId }, select: { status: true } });
        if (search && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(search.status)) {
          await prisma.permitSearch.update({
            where: { id: data.jobId },
            data: { status: 'CANCELLED' },
          });
        }
      } catch (err) {
        logger.error({ err, jobId: data.jobId }, 'Failed to update DB status on job cancel');
      }

      const room = `chat:${data.conversationId}`;
      io?.to(room).emit(WSEventType.JOB_FAILED, {
        jobId: data.jobId,
        jobType: 'permit:search',
        status: 'cancelled',
        result: { message: 'Search cancelled by user' },
        timestamp: new Date().toISOString(),
      });

      setTimeout(() => clearJobSignal(data.jobId), 2000);
    });

    // Handle ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', async (reason) => {
      logger.info({ socketId: socket.id, reason }, 'WebSocket client disconnected');
      // Do NOT cancel active searches on disconnect — searches are background jobs
      // that should complete regardless of socket lifecycle. Users can explicitly
      // cancel via cancel_permit_search or the UI cancel button.
      socketConversations.delete(socket.id);
    });

    socket.on('error', (error) => {
      logger.error({ socketId: socket.id, error }, 'WebSocket error');
    });
  });

  logger.info('✓ WebSocket server initialized');
  return io;
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Broadcast event to all connected clients
 */
export function broadcast(event: WSEventType, data: any): void {
  if (io) {
    io.to('dashboard').emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    logger.debug({ event, data }, 'Broadcast event sent');
  }
}

/**
 * Emit event to a specific room
 */
export function emitToRoom(room: string, event: WSEventType, data: any): void {
  if (io) {
    io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get connected client count
 */
export async function getConnectedClients(): Promise<number> {
  if (!io) return 0;
  const sockets = await io.fetchSockets();
  return sockets.length;
}

/**
 * Close WebSocket server
 */
export async function closeWebSocket(): Promise<void> {
  if (io) {
    io.close();
    io = null;
    logger.info('WebSocket server closed');
  }
}

// ==================== JOB EVENT HELPERS ====================

/**
 * Emit a job event to a specific conversation's chat room
 */
export function emitJobToConversation(
  conversationId: string,
  event: WSEventType,
  data: {
    jobId: string;
    jobType: string;
    status: string;
    result?: any;
    error?: string;
  }
): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, event, data);
  }
}

// ==================== WORKFLOW EVENT HELPERS ====================

/**
 * Emit workflow started event to the conversation room
 */
export function emitWorkflowStarted(conversationId: string, data: {
  workflowId: string;
  name: string;
  totalSteps: number;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_STARTED, data);
  }
  broadcast(WSEventType.WORKFLOW_STARTED, data);
}

/**
 * Emit workflow step started event
 */
export function emitWorkflowStepStarted(conversationId: string, data: {
  workflowId: string;
  stepOrder: number;
  stepName: string;
  action: string;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_STEP_STARTED, data);
  }
  broadcast(WSEventType.WORKFLOW_STEP_STARTED, data);
}

/**
 * Emit workflow step progress event
 */
export function emitWorkflowStepProgress(conversationId: string, data: {
  workflowId: string;
  stepOrder: number;
  progress: number;
  progressTotal?: number;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_STEP_PROGRESS, data);
  }
  broadcast(WSEventType.WORKFLOW_STEP_PROGRESS, data);
}

/**
 * Emit workflow step completed event
 */
export function emitWorkflowStepCompleted(conversationId: string, data: {
  workflowId: string;
  stepOrder: number;
  output: any;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_STEP_COMPLETED, data);
  }
  broadcast(WSEventType.WORKFLOW_STEP_COMPLETED, data);
}

/**
 * Emit workflow step failed event
 */
export function emitWorkflowStepFailed(conversationId: string, data: {
  workflowId: string;
  stepOrder: number;
  error: string;
  onFailure: string;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_STEP_FAILED, data);
  }
  broadcast(WSEventType.WORKFLOW_STEP_FAILED, data);
}

/**
 * Emit workflow step skipped event
 */
export function emitWorkflowStepSkipped(conversationId: string, data: {
  workflowId: string;
  stepOrder: number;
  reason: string;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_STEP_SKIPPED, data);
  }
  broadcast(WSEventType.WORKFLOW_STEP_SKIPPED, data);
}

/**
 * Emit workflow completed event
 */
export function emitWorkflowCompleted(conversationId: string, data: {
  workflowId: string;
  result: any;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_COMPLETED, data);
  }
  broadcast(WSEventType.WORKFLOW_COMPLETED, data);
}

/**
 * Emit workflow failed event
 */
export function emitWorkflowFailed(conversationId: string, data: {
  workflowId: string;
  error: string;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_FAILED, data);
  }
  broadcast(WSEventType.WORKFLOW_FAILED, data);
}

/**
 * Emit workflow cancelled event
 */
export function emitWorkflowCancelled(conversationId: string, data: {
  workflowId: string;
}): void {
  if (conversationId) {
    emitToRoom(`chat:${conversationId}`, WSEventType.WORKFLOW_CANCELLED, data);
  }
  broadcast(WSEventType.WORKFLOW_CANCELLED, data);
}

