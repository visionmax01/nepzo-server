import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { blockUser, unblockUser, checkBlockStatus } from '../controllers/blockController.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/block/:userId', blockUser);
router.delete('/block/:userId', unblockUser);
router.get('/block/check/:userId', checkBlockStatus);

export { router as blockRouter };
