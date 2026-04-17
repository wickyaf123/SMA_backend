import { createServer } from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { checkRedisHealth, disconnectRedis } from './config/redis';
import { initializeScheduler, stopScheduler } from './jobs/scheduler';
import { startChatHealthSweeper, stopChatHealthSweeper } from './jobs/chat-health-sweeper';
import { initSentry, Sentry } from './config/sentry';
import { settingsService } from './services/settings/settings.service';
import { initializeWebSocket, closeWebSocket } from './config/websocket';
import { initializeWorkers, stopWorkers } from './jobs/worker';
import { closeQueues } from './jobs/queues';
import { workflowEngine } from './services/workflow/workflow.engine';
import { getJerryGraph } from './services/chat/agent/graph';

/**
 * Initialize default settings (ensures settings record exists)
 */
async function initializeSettings(): Promise<void> {
  try {
    const settings = await settingsService.getSettings();
    logger.info(
      {
        linkedinEnabled: settings.linkedinGloballyEnabled,
        pipelineEnabled: settings.pipelineEnabled,
        schedulerEnabled: settings.schedulerEnabled,
        defaultEmailCampaign: settings.defaultEmailCampaignId ? 'configured' : 'NOT SET',
        defaultSmsCampaign: settings.defaultSmsCampaignId ? 'configured' : 'NOT SET',
      },
      '✓ Settings initialized'
    );
    
    // Warn if default campaigns are not configured
    if (!settings.defaultEmailCampaignId || !settings.defaultSmsCampaignId) {
      logger.warn(
        '⚠️  Default campaigns not fully configured. Auto-enrollment will be limited. ' +
        'Set via Settings > Default Campaigns in the UI or API.'
      );
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initialize settings');
    throw error;
  }
}

/**
 * Start the server
 */
async function startServer() {
  // Initialize Sentry FIRST (before anything else)
  initSentry();

  try {
    // Connect to database
    await connectDatabase();
    logger.info('✓ Database connected');

    // Check Redis connection
    const redisHealthy = await checkRedisHealth();
    if (!redisHealthy) {
      throw new Error('Redis connection failed');
    }
    logger.info('✓ Redis connected');

    // Initialize settings (creates defaults if not exists)
    await initializeSettings();

    // Create Express app
    const app = createApp();

    // Create HTTP server for WebSocket support
    const httpServer = createServer(app);

    // Initialize WebSocket server
    initializeWebSocket(httpServer);
    logger.info('✓ WebSocket server initialized');

    // Warm-compile Jerry's LangGraph and validate checkpointer connection
    try {
      await getJerryGraph();
      logger.info('✓ Jerry LangGraph compiled and checkpointer connected');
    } catch (err) {
      logger.error({ err }, '✗ Jerry LangGraph failed to compile — chat will retry on first request');
    }

    // Recover workflows stuck from previous crash
    const recovery = await workflowEngine.recoverStuckWorkflows();
    if (recovery.failed > 0) {
      logger.info({ ...recovery }, '✓ Workflow crash recovery complete');
    }

    // Initialize BullMQ workers for real-time job processing
    await initializeWorkers();
    logger.info('✓ BullMQ workers initialized');

    // Initialize cron scheduler (Day 8) with database-configurable schedules
    // Cron now adds jobs to queues instead of running directly
    await initializeScheduler();
    logger.info('✓ Daily automation jobs scheduled with database schedules');

    // Jerry pipeline observability sweeper — checks KPIs every 5min,
    // emits Pino warnings + Sentry breadcrumbs on threshold breaches.
    startChatHealthSweeper();

    // Start listening
    const server = httpServer.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 Health check: http://localhost:${config.port}/health`);
      logger.info(`🔌 WebSocket: ws://localhost:${config.port}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal, shutting down gracefully...');

      // Stop accepting new requests
      server.close(() => {
        logger.info('✓ HTTP server closed');
      });

      // Stop cron jobs
      stopScheduler();
      stopChatHealthSweeper();
      logger.info('✓ Cron jobs stopped');

      // Stop BullMQ workers
      try {
        await stopWorkers();
        logger.info('✓ BullMQ workers stopped');
      } catch (error) {
        logger.error({ error }, 'Error stopping workers');
      }

      // Close job queues
      try {
        await closeQueues();
        logger.info('✓ Job queues closed');
      } catch (error) {
        logger.error({ error }, 'Error closing queues');
      }

      // Close WebSocket server
      try {
        await closeWebSocket();
        logger.info('✓ WebSocket server closed');
      } catch (error) {
        logger.error({ error }, 'Error closing WebSocket');
      }

      // Give ongoing requests time to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Close database connection
      try {
        await disconnectDatabase();
        logger.info('✓ Database disconnected');
      } catch (error) {
        logger.error({ error }, 'Error disconnecting database');
      }

      // Close Redis connection
      try {
        await disconnectRedis();
        logger.info('✓ Redis disconnected');
      } catch (error) {
        logger.error({ error }, 'Error disconnecting Redis');
      }

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      Sentry.captureException(error);
      logger.fatal({ error }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      Sentry.captureException(reason);
      logger.fatal({ reason, promise }, 'Unhandled rejection');
      shutdown('unhandledRejection');
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

export { startServer };
