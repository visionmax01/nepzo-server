import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  requestFriend,
  acceptFriend,
  rejectFriend,
  cancelFriend,
  getFriends,
  getFriendRequests,
} from '../controllers/friendController.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/friend/request', requestFriend);
router.post('/friend/accept', acceptFriend);
router.post('/friend/reject', rejectFriend);
router.post('/friend/cancel', cancelFriend);
router.get('/friends', getFriends);
router.get('/friend/requests', getFriendRequests);

export { router as friendRouter };

