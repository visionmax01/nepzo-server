import express from 'express';
import { googleAuth, signup, login, registerPushToken, unregisterPushToken } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/google', googleAuth);
router.post('/signup', signup);
router.post('/login', login);
router.post('/push-token', authMiddleware, registerPushToken);
router.delete('/push-token', authMiddleware, unregisterPushToken);

export { router as authRouter };

