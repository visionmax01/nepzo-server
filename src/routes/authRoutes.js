import express from 'express';
import { googleAuth, signup, login, registerPushToken } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/google', googleAuth);
router.post('/signup', signup);
router.post('/login', login);
router.post('/push-token', authMiddleware, registerPushToken);

export { router as authRouter };

