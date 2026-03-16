import { Message } from '../models/Message.js';
import { Chat } from '../models/Chat.js';
import { encrypt, decrypt } from './encryptionService.js';

const extractMediaKey = (mediaUrl) => {
  if (!mediaUrl || typeof mediaUrl !== 'string') return undefined;
  const match = mediaUrl.match(/^media\/(.+)$/);
  return match ? match[1] : mediaUrl.replace(/^\/+/, '');
};

export const createMessage = async ({ chatId, senderId, receiverId, text, mediaUrl, messageType }) => {
  const encryptedText = text != null && text !== '' ? encrypt(text) : undefined;
  const encryptedMediaUrl = mediaUrl != null && mediaUrl !== '' ? encrypt(mediaUrl) : undefined;
  const mediaKey = extractMediaKey(mediaUrl);

  const message = await Message.create({
    chat: chatId,
    sender: senderId,
    receiver: receiverId,
    text: encryptedText,
    mediaUrl: encryptedMediaUrl,
    mediaKey,
    messageType: messageType || (mediaUrl ? 'image' : 'text'),
  });

  await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

  return message;
};

/**
 * Delete messages of the given types from a chat.
 * The caller must verify chatId belongs to the requesting user before calling this.
 * @param {string}   chatId
 * @param {string[]} types  subset of ['text','image','video','audio','file']
 * @returns {{ deletedCount: number }}
 */
export const clearMessagesByType = async (chatId, types) => {
  const validTypes = ['text', 'image', 'video', 'audio', 'file'];
  const filtered = (types || []).filter((t) => validTypes.includes(t));

  const query = { chat: chatId };
  if (filtered.length > 0 && filtered.length < validTypes.length) {
    query.messageType = { $in: filtered };
  }

  const result = await Message.deleteMany(query);
  return { deletedCount: result.deletedCount };
};

export const syncChatLastMessage = async (chatId) => {
  const latest = await Message.findOne({ chat: chatId }).sort({ createdAt: -1 }).select('_id').lean();
  await Chat.findByIdAndUpdate(chatId, { lastMessage: latest?._id || null });
  return latest?._id || null;
};

export const getUnreadCountForChat = async (chatId, receiverUserId) => {
  const count = await Message.countDocuments({
    chat: chatId,
    receiver: receiverUserId,
    seen: false,
  });
  return count;
};

export const getUnreadCountsForChats = async (chatIds, currentUserId) => {
  if (!chatIds?.length) return {};
  const map = {};
  await Promise.all(
    chatIds.map(async (chatId) => {
      const count = await Message.countDocuments({
        chat: chatId,
        receiver: currentUserId,
        seen: false,
      });
      if (count > 0) map[String(chatId)] = count;
    }),
  );
  return map;
};

/**
 * Check if the user can access media by key (user must be participant in chat containing the message).
 * @param {string} mediaKey - e.g. "chat-image/123-file.jpg"
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const canUserAccessMedia = async (mediaKey, userId) => {
  if (!mediaKey || !userId) return false;
  if (mediaKey.startsWith('profile-image/')) {
    return true;
  }
  const mediaUrlLegacy = `media/${mediaKey}`;
  const msg = await Message.findOne({
    $or: [{ mediaKey }, { mediaUrl: mediaUrlLegacy }],
  })
    .populate('chat')
    .lean();
  if (!msg?.chat) return false;
  const participants = msg.chat?.participants || [];
  return participants.some((p) => String(p) === String(userId));
};

export const getMessagesForChat = async (chatId, { limit = 50, before } = {}) => {
  const query = { chat: chatId };
  if (before) {
    query.createdAt = { $lt: before };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name avatar')
    .lean();

  const decryptForParticipant = (value) => {
    if (value == null || value === '') return value;
    return decrypt(value);
  };

  return messages.reverse().map((m) => ({
    id: m._id?.toString(),
    text: decryptForParticipant(m.text),
    mediaUrl: decryptForParticipant(m.mediaUrl),
    messageType: m.messageType,
    audioDuration: m.audioDuration,
    createdAt: m.createdAt,
    senderId: m.sender?._id?.toString(),
    senderName: m.sender?.name,
    senderAvatar: m.sender?.avatar,
    seen: m.seen ?? false,
  }));
};

