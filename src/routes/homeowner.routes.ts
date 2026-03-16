import { Router } from 'express';
import { homeownerController } from '../controllers/homeowner.controller';

const router = Router();

router.get('/', homeownerController.list.bind(homeownerController));
router.get('/stats', homeownerController.stats.bind(homeownerController));
router.get('/export', homeownerController.export.bind(homeownerController));
router.post('/enrich', homeownerController.triggerRealieEnrich.bind(homeownerController));
router.get('/:id', homeownerController.get.bind(homeownerController));
router.delete('/:id', homeownerController.delete.bind(homeownerController));

export default router;
