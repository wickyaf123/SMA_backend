import { Router } from 'express';
import { chatHealthController } from '../controllers/chat-health.controller';

const router = Router();

router.get('/overview', chatHealthController.overview.bind(chatHealthController));
router.get('/tools', chatHealthController.tools.bind(chatHealthController));
router.get('/nodes', chatHealthController.nodes.bind(chatHealthController));
router.get('/router', chatHealthController.router.bind(chatHealthController));
router.get('/funnel', chatHealthController.funnel.bind(chatHealthController));
router.get('/bad-turns', chatHealthController.badTurns.bind(chatHealthController));
router.get('/turns/:id', chatHealthController.turnTrace.bind(chatHealthController));
router.get('/feedback/breakdown', chatHealthController.feedbackBreakdown.bind(chatHealthController));

export default router;
