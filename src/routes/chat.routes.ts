import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';

const router = Router();

router.post('/conversations', chatController.createConversation.bind(chatController));
router.get('/conversations', chatController.listConversations.bind(chatController));
router.get('/conversations/:id', chatController.getConversation.bind(chatController));
router.delete('/conversations/:id', chatController.deleteConversation.bind(chatController));
router.post('/conversations/:id/messages', chatController.sendMessage.bind(chatController));

export default router;
