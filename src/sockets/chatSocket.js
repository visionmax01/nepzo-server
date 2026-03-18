import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Message } from '../models/Message.js';
import { Chat } from '../models/Chat.js';
import { Block } from '../models/Block.js';
import { User } from '../models/User.js';
import { cacheService } from '../services/cacheService.js';
import { sendMessageNotification } from '../services/pushNotificationService.js';
import { markGroupChatAsRead } from '../services/messageService.js';
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
    } catch {
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

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return;

    const isGroup = !!chat.isGroup;
    const participants = (chat.participants || []).map((p) => p.toString());

    if (isGroup) {
      const blockedByMe = await Block.find({ blocker: user.id, blocked: { $in: participants } })
        .select('blocked')
        .lean();
      const blockedIds = new Set(blockedByMe.map((b) => String(b.blocked)));
      if (blockedIds.size > 0) return;
    } else {
      const blocked = await Block.exists({ blocker: receiverId, blocked: user.id });
      if (blocked) {
        socket.emit('you_were_blocked', { blockerId: String(receiverId) });
        return;
      }
    }

    const encryptedText = text != null && text !== '' ? encrypt(text) : undefined;
    const encryptedMediaUrl = mediaUrl != null && mediaUrl !== '' ? encrypt(mediaUrl) : undefined;
    let mediaKey;
    let mediaKeys;
    if (mediaUrl) {
      try {
        const parsed = JSON.parse(mediaUrl);
        if (Array.isArray(parsed) && parsed.length > 0) {
          mediaKeys = parsed.map((u) => (u && u.match(/^media\/(.+)$/)?.[1]) || u.replace(/^\/+/, '')).filter(Boolean);
          mediaKey = mediaKeys[0];
        } else {
          mediaKey = mediaUrl.match(/^media\/(.+)$/)?.[1] ?? mediaUrl.replace(/^\/+/, '');
        }
      } catch {
        mediaKey = mediaUrl.match(/^media\/(.+)$/)?.[1] ?? mediaUrl.replace(/^\/+/, '');
      }
    }

    const message = await Message.create({
      chat: chatId,
      sender: user.id,
      receiver: isGroup ? null : receiverId,
      text: encryptedText,
      mediaUrl: encryptedMediaUrl,
      mediaKey,
      mediaKeys,
      messageType: messageType || (mediaUrl ? 'image' : 'text'),
      audioDuration: audioDuration ?? undefined,
    });

    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });
    await cacheService.invalidateChatsForUsers(participants);

    const decryptedText = message.text != null ? decrypt(message.text) : undefined;
    const decryptedMediaUrl = message.mediaUrl != null ? decrypt(message.mediaUrl) : undefined;

    const messagePayload = {
      id: message.id,
      chatId,
      senderId: user.id,
      receiverId: isGroup ? null : receiverId,
      text: decryptedText,
      mediaUrl: decryptedMediaUrl,
      messageType: message.messageType,
      audioDuration: message.audioDuration,
      createdAt: message.createdAt,
      seen: message.seen ?? false,
    };

    io.to(`chat:${chatId}`).emit('receive_message', messagePayload);

    if (isGroup) {
      const sender = await User.findById(user.id).select('name').lean();
      for (const pid of participants) {
        if (pid === String(user.id)) continue;
        const viewing = await isUserViewingChat(io, pid, chatId);
        if (!viewing) {
          io.to(`user:${pid}`).emit('receive_message', messagePayload);
          sendMessageNotification(pid, sender?.name, text, chatId, message.messageType).catch(() => {});
        }
      }
    } else {
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
    }
  });

  socket.on('message_seen', async ({ messageId, chatId }) => {
    if (!messageId || !chatId) return;
    await Message.findByIdAndUpdate(messageId, { seen: true });
    io.to(`chat:${chatId}`).emit('message_seen', { messageId, userId: user.id });
  });

  socket.on('mark_chat_seen', async ({ chatId }) => {
    if (!chatId) return;
    const chat = await Chat.findById(chatId).select('isGroup').lean();
    const isGroup = !!chat?.isGroup;

    if (isGroup) {
      await markGroupChatAsRead(chatId, user.id);
      io.to(`chat:${chatId}`).emit('messages_seen', { chatId, userId: user.id });
    } else {
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
    }
  });
};

