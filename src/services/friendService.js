import { User } from '../models/User.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { Friendship } from '../models/Friendship.js';
import { cacheService } from './cacheService.js';
import { AppError, ValidationError } from '../utils/errorTypes.js';
import { sendFriendRequestNotification } from './pushNotificationService.js';

const normalizePair = (a, b) => {
  if (a.toString() < b.toString()) return [a, b];
  return [b, a];
};

export const sendFriendRequest = async (currentUserId, connectId) => {
  let targetUser = await cacheService.getUserByConnectId(connectId);
  if (!targetUser) {
    targetUser = await User.findOne({ connectId }).lean();
    if (targetUser) {
      await cacheService.setUserByConnectId(connectId, targetUser);
    }
  }

  if (!targetUser) {
    throw new ValidationError('User not found for provided ConnectID');
  }

  if (targetUser._id.toString() === currentUserId.toString()) {
    throw new ValidationError('Cannot send friend request to yourself');
  }

  const [user1, user2] = normalizePair(currentUserId, targetUser._id);

  const existingFriendship = await Friendship.findOne({ user1, user2 });
  if (existingFriendship) {
    throw new ValidationError('You are already friends');
  }

  const existingPending = await FriendRequest.findOne({
    from: currentUserId,
    to: targetUser._id,
    status: 'pending',
  });

  if (existingPending) {
    throw new ValidationError('Friend request already sent');
  }

  // Reuse cancelled/rejected request to avoid unique index violation on cancel
  const existingCancelledOrRejected = await FriendRequest.findOne({
    from: currentUserId,
    to: targetUser._id,
    status: { $in: ['cancelled', 'rejected'] },
  });

  if (existingCancelledOrRejected) {
    existingCancelledOrRejected.status = 'pending';
    await existingCancelledOrRejected.save();
    const fromUser = await User.findById(currentUserId).select('name').lean();
    sendFriendRequestNotification(targetUser._id.toString(), fromUser?.name).catch(() => {});
    return { request: existingCancelledOrRejected };
  }

  const incomingRequest = await FriendRequest.findOne({
    from: targetUser._id,
    to: currentUserId,
    status: 'pending',
  });

  if (incomingRequest) {
    // Auto-accept mutual requests
    await incomingRequest.updateOne({ status: 'accepted' });
    await Friendship.create({ user1, user2 });
    await cacheService.invalidateFriends(currentUserId);
    await cacheService.invalidateFriends(targetUser._id.toString());
    return { autoAccepted: true };
  }

  const request = await FriendRequest.create({
    from: currentUserId,
    to: targetUser._id,
  });

  const fromUser = await User.findById(currentUserId).select('name').lean();
  sendFriendRequestNotification(targetUser._id.toString(), fromUser?.name).catch(() => {});

  return { request };
};

export const acceptFriendRequest = async (currentUserId, requestId) => {
  const request = await FriendRequest.findById(requestId);
  if (!request) throw new AppError('Friend request not found', 404);
  if (request.to.toString() !== currentUserId.toString()) {
    throw new AppError('Not authorized to accept this request', 403);
  }

  if (request.status !== 'pending') {
    throw new ValidationError('Friend request is not pending');
  }

  request.status = 'accepted';
  await request.save();

  const [user1, user2] = normalizePair(request.from, request.to);
  await Friendship.updateOne(
    { user1, user2 },
    { user1, user2 },
    { upsert: true },
  );

  await cacheService.invalidateFriends(request.from.toString());
  await cacheService.invalidateFriends(request.to.toString());

  return { success: true };
};

export const rejectFriendRequest = async (currentUserId, requestId) => {
  const request = await FriendRequest.findById(requestId);
  if (!request) throw new AppError('Friend request not found', 404);
  if (request.to.toString() !== currentUserId.toString()) {
    throw new AppError('Not authorized to reject this request', 403);
  }

  request.status = 'rejected';
  await request.save();

  return { success: true };
};

export const cancelFriendRequest = async (currentUserId, requestId) => {
  const request = await FriendRequest.findById(requestId);
  if (!request) throw new AppError('Friend request not found', 404);
  if (request.from.toString() !== currentUserId.toString()) {
    throw new AppError('Not authorized to cancel this request', 403);
  }

  if (request.status !== 'pending') {
    throw new ValidationError('Request is no longer pending');
  }

  try {
    request.status = 'cancelled';
    await request.save();
  } catch (err) {
    // E11000: duplicate key - another cancelled doc exists for same from/to (from send→cancel cycles)
    if (err.code === 11000) {
      await FriendRequest.deleteOne({ _id: requestId });
    } else {
      throw err;
    }
  }

  return { success: true };
};

export const listFriends = async (currentUserId) => {
  const cached = await cacheService.getFriends(currentUserId);
  if (cached) return cached;

  const friendships = await Friendship.find({
    $or: [{ user1: currentUserId }, { user2: currentUserId }],
  })
    .populate('user1', 'name email avatar connectId status')
    .populate('user2', 'name email avatar connectId status')
    .lean();

  const friends = friendships.map((f) => {
    const friendUser =
      f.user1._id.toString() === currentUserId.toString() ? f.user2 : f.user1;
    return friendUser;
  });

  await cacheService.setFriends(currentUserId, friends);
  return friends;
};

export const listFriendRequests = async (currentUserId) => {
  const incoming = await FriendRequest.find({
    to: currentUserId,
    status: 'pending',
  })
    .populate('from', 'name email avatar connectId status')
    .lean();

  const outgoing = await FriendRequest.find({
    from: currentUserId,
    status: 'pending',
  })
    .populate('to', 'name email avatar connectId status')
    .lean();

  return { incoming, outgoing };
};

