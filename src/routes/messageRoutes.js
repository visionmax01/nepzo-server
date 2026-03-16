import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  getChats,
  getMessages,
  getOrCreateChatWithParticipant,
  createGroupChat,
  addMembers,
  getChatProfile,
  updateGroupProfile,
  clearMessages,
  deleteGroup,
  kickMember,
  assignAdmin,
  assignSubAdmin,
  removeSubAdmin,
  leaveGroup,
} from '../controllers/messageController.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/chats', getChats);
router.post('/chats', getOrCreateChatWithParticipant);
router.post('/chats/group', createGroupChat);
router.post('/chats/:chatId/members', addMembers);
router.get('/chats/:chatId/profile', getChatProfile);
router.put('/chats/:chatId/profile', updateGroupProfile);
router.delete('/chats/:chatId', deleteGroup);
router.post('/chats/:chatId/kick', kickMember);
router.put('/chats/:chatId/admin', assignAdmin);
router.put('/chats/:chatId/subadmin', assignSubAdmin);
router.delete('/chats/:chatId/subadmin', removeSubAdmin);
router.post('/chats/:chatId/leave', leaveGroup);
router.get('/messages/:chatId', getMessages);
router.delete('/messages/:chatId/clear', clearMessages);

export { router as messageRouter };

