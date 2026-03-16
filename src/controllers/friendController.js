import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  listFriends,
  listFriendRequests,
} from '../services/friendService.js';

export const requestFriend = async (req, res, next) => {
  try {
    const { connectId } = req.body;
    const result = await sendFriendRequest(req.user.id, connectId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const acceptFriend = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const result = await acceptFriendRequest(req.user.id, requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const rejectFriend = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const result = await rejectFriendRequest(req.user.id, requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const cancelFriend = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const result = await cancelFriendRequest(req.user.id, requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const getFriends = async (req, res, next) => {
  try {
    const result = await listFriends(req.user.id);
    res.json({ success: true, friends: result });
  } catch (err) {
    next(err);
  }
};

export const getFriendRequests = async (req, res, next) => {
  try {
    const result = await listFriendRequests(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

