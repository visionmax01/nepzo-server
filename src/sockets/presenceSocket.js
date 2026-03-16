import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { getRecentMissedCallsForUser } from '../services/callLogService.js';
import { Chat } from '../models/Chat.js';
import { cacheService } from '../services/cacheService.js';

const invalidatePresenceCaches = async (userId) => {
  const chats = await Chat.find({ participants: userId }).select('participants').lean();
  const impactedUserIds = new Set([String(userId)]);
  chats.forEach((chat) => {
    (chat.participants || []).forEach((participantId) => impactedUserIds.add(String(participantId)));
  });
  const ids = [...impactedUserIds];
  await Promise.all([
    cacheService.invalidateChatsForUsers(ids),
    cacheService.invalidateFriendsForUsers(ids),
  ]);
};

const authenticateSocket = (socket) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    return { id: payload.sub };
  } catch {
    return null;
  }
};

export const registerPresenceSocket = (io, socket) => {
  const user = authenticateSocket(socket);
  if (!user) {
    socket.disconnect(true);
    return;
  }

  User.findById(user.id)
    .select('lastSeen')
    .lean()
    .then(async (u) => {
      await User.findByIdAndUpdate(user.id, { status: 'online' });
      await invalidatePresenceCaches(user.id);
      io.emit('user_status', { userId: user.id, status: 'online' });
      const since = u?.lastSeen ? new Date(u.lastSeen).getTime() : Date.now() - 24 * 60 * 60 * 1000;
      const missedCalls = await getRecentMissedCallsForUser(user.id, { since });
      if (missedCalls.length > 0) {
        socket.emit('missed_calls', { missedCalls });
      }
    })
    .catch(() => {});

  socket.on('typing', ({ chatId }) => {
    if (chatId) {
      const room = `chat:${String(chatId)}`;
      socket.to(room).emit('typing', { chatId: String(chatId), userId: String(user.id) });
    }
  });

  socket.on('stop_typing', ({ chatId }) => {
    if (chatId) {
      const room = `chat:${String(chatId)}`;
      socket.to(room).emit('stop_typing', { chatId: String(chatId), userId: String(user.id) });
    }
  });

  socket.on('disconnect', async () => {
    const lastSeen = new Date();
    await User.findByIdAndUpdate(user.id, {
      status: 'offline',
      lastSeen,
    });
    await invalidatePresenceCaches(user.id);
    io.emit('user_status', { userId: user.id, status: 'offline', lastSeen });
  });
};

