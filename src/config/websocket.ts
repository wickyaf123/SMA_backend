/**
 * WebSocket Server Configuration
 * Real-time event broadcasting to connected clients
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { config } from './index';

let io: SocketIOServer | null = null;

/**
 * WebSocket event types for type safety
 */
export enum WSEventType {
  // Job events
  JOB_STARTED = 'job:started',
  JOB_PROGRESS = 'job:progress',
  JOB_COMPLETED = 'job:completed',
  JOB_FAILED = 'job:failed',

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
}

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.isDevelopment ? '*' : process.env.FRONTEND_URL,
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

    // Handle ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'WebSocket client disconnected');
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



