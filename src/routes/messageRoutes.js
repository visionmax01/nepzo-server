import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  getChats,
  getMessages,
  getOrCreateChatWithParticipant,
  clearMessages,
} from '../controllers/messageController.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/chats', getChats);
router.post('/chats', getOrCreateChatWithParticipant);
router.get('/messages/:chatId', getMessages);
router.delete('/messages/:chatId/clear', clearMessages);

export { router as messageRouter };

