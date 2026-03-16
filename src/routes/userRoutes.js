import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getMe, updateMe, searchByConnectId } from '../controllers/userController.js';

const router = express.Router();

router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, updateMe);
router.get('/search', authMiddleware, searchByConnectId);

export { router as userRouter };

