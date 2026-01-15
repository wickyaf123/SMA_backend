/**
 * Health/Test Routes
 * Includes notification testing endpoint and integration status
 */

import { Router, Request, Response } from 'express';
import { getBasicHealth, getSystemHealth, getExtendedHealth, getVersion } from '../controllers/health.controller';
import { emailNotificationService } from '../services/notification/email-notification.service';
import { logger } from '../utils/logger';
import { authenticateApiKey } from '../middleware/auth';

const router = Router();

/**
 * GET /health
 * Basic health check (public)
 */
router.get('/health', getBasicHealth);

/**
 * GET /api/v1/health
 * Detailed system health (protected)
 */
router.get('/api/v1/health', authenticateApiKey, getSystemHealth);

/**
 * GET /api/v1/health/extended
 * Extended health check including external APIs (protected)
 */
router.get('/api/v1/health/extended', authenticateApiKey, getExtendedHealth);

/**
 * GET /api/v1/integrations/status
 * Dedicated integration status endpoint (alias for health/extended but focused on integrations)
 * Returns status of all external service connections
 */
router.get('/api/v1/integrations/status', authenticateApiKey, getExtendedHealth);

/**
 * GET /api/v1/version
 * API version info (protected)
 */
router.get('/api/v1/version', authenticateApiKey, getVersion);

/**
 * POST /api/v1/test-notification
 * Test email notification system (protected)
 */
router.post('/api/v1/test-notification', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    logger.info('Testing email notification system');
    
    const success = await emailNotificationService.sendTestNotification();
    
    if (success) {
      return res.status(200).json({
        success: true,
        message: 'Test notification sent successfully. Check your email!',
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to send test notification. Check server logs.',
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error testing notification');
    return res.status(500).json({
      success: false,
      message: 'Error sending test notification',
      error: error.message,
    });
  }
});

export default router;
