import { Router } from 'express';
import { connectionController } from '../controllers/connection.controller';

const router = Router();

router.get('/', connectionController.list.bind(connectionController));
router.get('/stats', connectionController.stats.bind(connectionController));
router.post('/resolve', connectionController.resolve.bind(connectionController));
router.get('/contact/:contactId', connectionController.getByContact.bind(connectionController));
router.get('/homeowner/:homeownerId', connectionController.getByHomeowner.bind(connectionController));
router.get('/:id', connectionController.get.bind(connectionController));

export default router;
