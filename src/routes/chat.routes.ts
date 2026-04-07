import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import multer from 'multer';
import { chatController } from '../controllers/chat.controller';
import { chatRateLimiter } from '../middleware/rateLimit';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

router.post('/conversations', chatController.createConversation.bind(chatController));
router.get('/conversations', chatController.listConversations.bind(chatController));

// Search must come before :id routes so Express doesn't treat "search" as an ID
router.get('/conversations/search', chatController.searchConversations.bind(chatController));

router.get('/conversations/:id', chatController.getConversation.bind(chatController));
router.delete('/conversations/:id', chatController.deleteConversation.bind(chatController));
router.post('/conversations/:id/messages', chatRateLimiter, chatController.sendMessage.bind(chatController));
router.post('/conversations/:id/workflow-presets/:presetId/run', chatController.runWorkflowPreset.bind(chatController));
router.post('/conversations/:id/upload', upload.single('file'), chatController.uploadFile.bind(chatController));

// Feedback routes
router.post('/messages/:id/feedback', chatController.submitFeedback.bind(chatController));
router.get('/feedback/summary', chatController.getFeedbackSummary.bind(chatController));

// Export download endpoint
router.get('/exports/:filename', (req, res) => {
  const { filename } = req.params;
  // Sanitize filename to prevent path traversal
  const sanitized = path.basename(filename);
  const filePath = path.join(process.cwd(), 'tmp', 'exports', sanitized);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: 'Export file not found or expired' });
    return;
  }

  res.download(filePath, `contacts_export.csv`, (err) => {
    if (err) {
      console.error('Download error:', err);
    }
  });
});

export default router;
