/**
 * Health/Test Routes
 * Includes notification testing endpoint and integration status
 */

import { Router, Request, Response } from 'express';
import { getBasicHealth, getSystemHealth, getExtendedHealth, getVersion } from '../controllers/health.controller';
import { emailNotificationService } from '../services/notification/email-notification.service';
import { authMiddleware } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

const router = Router();

router.get('/health', getBasicHealth);

router.get('/api/v1/health', getSystemHealth);

router.get('/api/v1/health/extended', getExtendedHealth);

router.get('/api/v1/integrations/status', getExtendedHealth);

router.get('/api/v1/version', getVersion);

router.post('/api/v1/test-notification', authMiddleware, async (req: Request, res: Response) => {
  try {
    logger.info('Testing email notification system');

    const success = await emailNotificationService.sendTestNotification();

    if (success) {
      return sendSuccess(res, {
        message: 'Test notification sent successfully. Check your email!',
      });
    } else {
      return sendError(res, 500, 'Failed to send test notification. Check server logs.', 'NOTIFICATION_FAILED');
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error testing notification');
    return sendError(res, 500, 'Error sending test notification', 'NOTIFICATION_ERROR');
  }
});

export default router;
