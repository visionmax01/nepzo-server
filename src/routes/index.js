import express from 'express';
import { authRouter } from './authRoutes.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getBadgeCountForUser } from '../services/pushNotificationService.js';
import { friendRouter } from './friendRoutes.js';
import { messageRouter } from './messageRoutes.js';
import { uploadRouter } from './uploadRoutes.js';
import { callRouter } from './callRoutes.js';
import { userRouter } from './userRoutes.js';
import { blockRouter } from './blockRoutes.js';

const router = express.Router();

router.get('/auth/notifications/badge', authMiddleware, async (req, res) => {
  try {
    const count = await getBadgeCountForUser(req.user.id);
    res.json({ success: true, badge: count });
  } catch (err) {
    res.status(500).json({ success: false, badge: 0 });
  }
});

router.use('/auth', authRouter);
router.use('/', uploadRouter);
router.use('/', friendRouter);
router.use('/', messageRouter);
router.use('/', callRouter);
router.use('/', blockRouter);
router.use('/users', userRouter);

export { router as routes };

