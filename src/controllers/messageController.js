import { Chat } from '../models/Chat.js';
import { listChatsForUser, getOrCreateChat } from '../services/chatService.js';
import { getMessagesForChat, clearMessagesByType, syncChatLastMessage, getUnreadCountsForChats } from '../services/messageService.js';
import { cacheService } from '../services/cacheService.js';
import { Friendship } from '../models/Friendship.js';
import { ValidationError } from '../utils/errorTypes.js';
import { decrypt } from '../services/encryptionService.js';

const decryptLastMessage = (lastMessage) => {
  if (!lastMessage || typeof lastMessage !== 'object') return lastMessage;
  const dec = (v) => (v != null && v !== '' ? decrypt(v) : v);
  return {
    ...lastMessage,
    text: dec(lastMessage.text),
    mediaUrl: dec(lastMessage.mediaUrl),
  };
};

const formatChatForClient = (chat, currentUserId, unreadCount = 0) => {
  const participants = chat.participants || [];
  const other = participants.find((p) => p._id?.toString() !== currentUserId?.toString());
  return {
    id: chat._id?.toString(),
    name: other?.name || 'Chat',
    receiverId: other?._id?.toString(),
    receiverAvatar: other?.avatar,
    receiverStatus: other?.status || 'offline',
    receiverLastSeen: other?.lastSeen,
    lastMessage: chat.lastMessage ? decryptLastMessage(chat.lastMessage) : null,
    unreadCount: unreadCount ?? 0,
  };
};

export const getChats = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const cached = await cacheService.getChats(currentUserId);
    if (cached && Array.isArray(cached)) {
      const chatIds = cached.map((c) => (c.id || c._id?.toString())).filter(Boolean);
      const unreadMap = chatIds.length ? await getUnreadCountsForChats(chatIds, currentUserId) : {};
      const formatted = cached.map((c) => {
        const base = c.receiverId ? c : formatChatForClient(c, currentUserId, 0);
        const chatId = base.id || c._id?.toString();
        const lastMessage = base.lastMessage ? decryptLastMessage(base.lastMessage) : null;
        return { ...base, lastMessage, unreadCount: unreadMap[chatId] ?? base.unreadCount ?? 0 };
      });
      res.set('x-cache', 'HIT');
      res.json({ success: true, chats: formatted, cached: true });
      return;
    }

    const chats = await listChatsForUser(currentUserId);
    const chatIds = chats.map((c) => c._id?.toString()).filter(Boolean);
    const unreadMap = chatIds.length ? await getUnreadCountsForChats(chatIds, currentUserId) : {};
    const formatted = chats.map((c) =>
      formatChatForClient(c, currentUserId, unreadMap[c._id?.toString()] ?? 0),
    );
    await cacheService.setChats(currentUserId, formatted);
    res.set('x-cache', 'MISS');
    res.json({ success: true, chats: formatted });
  } catch (err) {
    next(err);
  }
};

export const getOrCreateChatWithParticipant = async (req, res, next) => {
  try {
    const { participantId } = req.body;
    if (!participantId) {
      throw new ValidationError('participantId is required');
    }

    const currentUserId = req.user.id;
    if (participantId === currentUserId) {
      throw new ValidationError('Cannot chat with yourself');
    }

    const [user1, user2] =
      currentUserId.toString() < participantId.toString()
        ? [currentUserId, participantId]
        : [participantId, currentUserId];
    const isFriend = await Friendship.findOne({ user1, user2 });
    if (!isFriend) {
      throw new ValidationError('You can only chat with friends');
    }

    const participantIds = [currentUserId, participantId];
    const chat = await getOrCreateChat(participantIds);

    await cacheService.invalidateChatsForUsers([currentUserId, participantId]);

    const chatDoc = await Chat.findById(chat._id)
      .populate('participants', 'name email avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const participants = chatDoc?.participants || [];
    const otherParticipant = participants.find((p) => p._id?.toString() !== currentUserId);
    const response = {
      id: chat._id.toString(),
      name: otherParticipant?.name || 'Chat',
      receiverId: otherParticipant?._id?.toString(),
      receiverAvatar: otherParticipant?.avatar,
      receiverStatus: otherParticipant?.status || 'offline',
      receiverLastSeen: otherParticipant?.lastSeen,
      participants: chatDoc?.participants,
      lastMessage: chatDoc?.lastMessage ? decryptLastMessage(chatDoc.lastMessage) : null,
    };

    res.json({ success: true, chat: response });
  } catch (err) {
    next(err);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { before, limit } = req.query;
    const messages = await getMessagesForChat(chatId, {
      before: before ? new Date(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, messages });
  } catch (err) {
    next(err);
  }
};

export const clearMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;

    // Verify the requesting user is a participant of this chat
    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

    const isParticipant = chat.participants.some(
      (p) => p.toString() === currentUserId.toString(),
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { types } = req.body;
    const { deletedCount } = await clearMessagesByType(chatId, types);
    await syncChatLastMessage(chatId);
    await cacheService.invalidateChatsForUsers(chat.participants);
    res.json({ success: true, deletedCount });
  } catch (err) {
    next(err);
  }
};

