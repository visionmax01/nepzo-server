import { User } from '../models/User.js';
import { deleteObject } from '../services/mediaService.js';
import { cacheService } from '../services/cacheService.js';
import { Friendship } from '../models/Friendship.js';
import { Chat } from '../models/Chat.js';

const serializeUser = (user) => ({
  id: user.id || user._id?.toString(),
  name: user.name,
  email: user.email,
  connectId: user.connectId,
  avatar: user.avatar,
  bio: user.bio,
  status: user.status,
});

const invalidateProfileDependentCaches = async (userId) => {
  const friendships = await Friendship.find({
    $or: [{ user1: userId }, { user2: userId }],
  })
    .select('user1 user2')
    .lean();

  const relatedFriendIds = new Set([String(userId)]);
  friendships.forEach((f) => {
    relatedFriendIds.add(String(f.user1));
    relatedFriendIds.add(String(f.user2));
  });

  const chats = await Chat.find({ participants: userId }).select('participants').lean();
  const relatedChatIds = new Set([String(userId)]);
  chats.forEach((chat) => {
    (chat.participants || []).forEach((participantId) => relatedChatIds.add(String(participantId)));
  });

  await Promise.all([
    cacheService.invalidateUser(userId),
    cacheService.invalidateFriendsForUsers([...relatedFriendIds]),
    cacheService.invalidateChatsForUsers([...relatedChatIds]),
  ]);
};

export const searchByConnectId = async (req, res, next) => {
  try {
    const { connectId } = req.query;
    if (!connectId || typeof connectId !== 'string') {
      return res.status(400).json({ success: false, message: 'ConnectID is required' });
    }

    const trimmed = connectId.trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'ConnectID cannot be empty' });
    }

    const user = await User.findOne({ connectId: trimmed })
      .select('name email connectId avatar status')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    await cacheService.setUserByConnectId(trimmed, user);

    return res.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        connectId: user.connectId,
        avatar: user.avatar,
        status: user.status,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const cached = await cacheService.getUser(req.user.id);
    if (cached) {
      return res.json({
        success: true,
        user: serializeUser(cached),
      });
    }

    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await cacheService.setUser(req.user.id, user);
    await cacheService.setUserByConnectId(user.connectId, user);

    return res.json({
      success: true,
      user: serializeUser(user),
    });
  } catch (err) {
    return next(err);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'avatar', 'bio'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== 'undefined') {
        updates[field] = req.body[field];
      }
    });

    if (typeof updates.avatar !== 'undefined') {
      const currentUser = await User.findById(req.user.id).select('avatar').lean();
      const oldAvatar = currentUser?.avatar;
      if (oldAvatar && !oldAvatar.startsWith('http://') && !oldAvatar.startsWith('https://')) {
        const key = oldAvatar.replace(/^media\/?/, '');
        if (key) {
          void deleteObject(key);
        }
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, lean: true },
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await cacheService.setUser(req.user.id, user);
    await cacheService.setUserByConnectId(user.connectId, user);
    await invalidateProfileDependentCaches(req.user.id);

    return res.json({
      success: true,
      user: serializeUser(user),
    });
  } catch (err) {
    return next(err);
  }
};

