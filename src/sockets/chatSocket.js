import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Message } from '../models/Message.js';
import { Chat } from '../models/Chat.js';
import { Block } from '../models/Block.js';
import { User } from '../models/User.js';
import { cacheService } from '../services/cacheService.js';
import { sendMessageNotification } from '../services/pushNotificationService.js';
import { encrypt, decrypt } from '../services/encryptionService.js';

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

const isUserViewingChat = async (io, userId, chatId) => {
  if (!io || !userId || !chatId) return false;
  const room = `user:${String(userId)}`;
  const chatRoom = `chat:${String(chatId)}`;
  const sockets = await io.in(room).fetchSockets();
  return sockets.some((s) => s.rooms.has(chatRoom));
};

export const registerChatSocket = (io, socket) => {
  const user = authenticateSocket(socket);
  if (!user) {
    socket.disconnect(true);
    return;
  }

  socket.join(`user:${String(user.id)}`);

  socket.on('join_user', ({ chatId }) => {
    if (chatId) {
      socket.join(`chat:${String(chatId)}`);
    }
  });

  socket.on('leave_chat', ({ chatId }) => {
    if (chatId) {
      socket.leave(`chat:${String(chatId)}`);
    }
  });

  socket.on('block_user', async ({ blockedId }) => {
    const bid = String(blockedId);
    if (!bid || bid === String(user.id)) return;
    try {
      await Block.findOneAndUpdate(
        { blocker: user.id, blocked: bid },
        {},
        { upsert: true, new: true },
      );
      io.to(`user:${bid}`).emit('you_were_blocked', { blockerId: String(user.id) });
    } catch (err) {
      console.error('block_user error:', err);
    }
  });

  socket.on('unblock_user', async ({ unblockedId }) => {
    if (!unblockedId) return;
    try {
      await Block.deleteOne({ blocker: user.id, blocked: unblockedId });
    } catch {}
  });

  socket.on('send_message', async (payload) => {
    const { chatId, receiverId, text, mediaUrl, messageType, audioDuration } = payload;
    if (!chatId || (!text && !mediaUrl)) return;

    const blocked = await Block.exists({ blocker: receiverId, blocked: user.id });
    if (blocked) {
      socket.emit('you_were_blocked', { blockerId: String(receiverId) });
      return;
    }

    const encryptedText = text != null && text !== '' ? encrypt(text) : undefined;
    const encryptedMediaUrl = mediaUrl != null && mediaUrl !== '' ? encrypt(mediaUrl) : undefined;
    const mediaKey = mediaUrl ? (mediaUrl.match(/^media\/(.+)$/)?.[1] ?? mediaUrl.replace(/^\/+/, '')) : undefined;

    const message = await Message.create({
      chat: chatId,
      sender: user.id,
      receiver: receiverId,
      text: encryptedText,
      mediaUrl: encryptedMediaUrl,
      mediaKey,
      messageType: messageType || (mediaUrl ? 'image' : 'text'),
      audioDuration: audioDuration ?? undefined,
    });

    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });
    await cacheService.invalidateChatsForUsers([user.id, receiverId]);

    const decryptedText = message.text != null ? decrypt(message.text) : undefined;
    const decryptedMediaUrl = message.mediaUrl != null ? decrypt(message.mediaUrl) : undefined;

    const messagePayload = {
      id: message.id,
      chatId,
      senderId: user.id,
      receiverId,
      text: decryptedText,
      mediaUrl: decryptedMediaUrl,
      messageType: message.messageType,
      audioDuration: message.audioDuration,
      createdAt: message.createdAt,
      seen: message.seen ?? false,
    };

    io.to(`chat:${chatId}`).emit('receive_message', messagePayload);

    const receiverViewingChat = await isUserViewingChat(io, receiverId, chatId);
    if (!receiverViewingChat) {
      io.to(`user:${String(receiverId)}`).emit('receive_message', messagePayload);
      const sender = await User.findById(user.id).select('name').lean();
      sendMessageNotification(
        receiverId,
        sender?.name,
        text,
        chatId,
        message.messageType,
      ).catch(() => {});
    }
  });

  socket.on('message_seen', async ({ messageId, chatId }) => {
    if (!messageId || !chatId) return;
    await Message.findByIdAndUpdate(messageId, { seen: true });
    io.to(`chat:${chatId}`).emit('message_seen', { messageId, userId: user.id });
  });

  socket.on('mark_chat_seen', async ({ chatId }) => {
    if (!chatId) return;
    const toUpdate = await Message.find(
      { chat: chatId, receiver: user.id, seen: false },
      { _id: 1 },
    ).lean();
    const messageIds = toUpdate.map((m) => m._id?.toString()).filter(Boolean);
    if (messageIds.length > 0) {
      await Message.updateMany(
        { chat: chatId, receiver: user.id, seen: false },
        { seen: true },
      );
      io.to(`chat:${chatId}`).emit('messages_seen', { messageIds });
    }
  });
};

