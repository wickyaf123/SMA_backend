/**
 * Health/Test Routes
 * Includes notification testing endpoint and integration status
 */

import { Router, Request, Response } from 'express';
import { getBasicHealth, getSystemHealth, getExtendedHealth, getVersion } from '../controllers/health.controller';
import { emailNotificationService } from '../services/notification/email-notification.service';
import { logger } from '../utils/logger';

const router = Router();

router.get('/health', getBasicHealth);

router.get('/api/v1/health', getSystemHealth);

router.get('/api/v1/health/extended', getExtendedHealth);

router.get('/api/v1/integrations/status', getExtendedHealth);

router.get('/api/v1/version', getVersion);

router.post('/api/v1/test-notification', async (req: Request, res: Response) => {
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
