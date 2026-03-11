import { Router } from 'express';
import { permitController } from '../controllers/permit.controller';

const router = Router();

router.post('/search', permitController.search.bind(permitController));
router.get('/status', permitController.status.bind(permitController));
router.get('/latest', permitController.getLatestSearch.bind(permitController));
router.get('/', permitController.listSearches.bind(permitController));
router.get('/:id', permitController.getSearch.bind(permitController));
router.post('/:id/route', permitController.route.bind(permitController));
router.post('/:id/approve', permitController.approve.bind(permitController));

export default router;
