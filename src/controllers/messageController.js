import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { ChatReadState } from '../models/ChatReadState.js';
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
  const isGroup = !!chat.isGroup;

  if (isGroup) {
    return {
      id: chat._id?.toString(),
      name: chat.groupName || 'Group',
      isGroup: true,
      receiverId: null,
      receiverAvatar: chat.groupAvatar || null,
      receiverStatus: null,
      receiverLastSeen: null,
      createdBy: chat.createdBy?.toString?.() || null,
      groupAvatar: chat.groupAvatar || null,
      groupBio: chat.groupBio || null,
      participantIds: participants.length
        ? participants.map((p) => p._id?.toString()).filter(Boolean)
        : (chat.participantIds || []),
      lastMessage: chat.lastMessage ? decryptLastMessage(chat.lastMessage) : null,
      unreadCount: unreadCount ?? 0,
    };
  }

  const other = participants.find((p) => p._id?.toString() !== currentUserId?.toString());
  return {
    id: chat._id?.toString(),
    name: other?.name || 'Chat',
    isGroup: false,
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

export const createGroupChat = async (req, res, next) => {
  try {
    const { participantIds: rawIds, groupName } = req.body;
    if (!Array.isArray(rawIds) || rawIds.length < 1) {
      throw new ValidationError('At least one participant is required');
    }
    const groupNameStr = typeof groupName === 'string' ? groupName.trim() : '';
    if (!groupNameStr || groupNameStr.length > 100) {
      throw new ValidationError('Group name is required (max 100 characters)');
    }

    const currentUserId = req.user.id;
    const participantIds = [...new Set([currentUserId.toString(), ...rawIds.map(String)])];

    for (const pid of participantIds) {
      if (pid === currentUserId.toString()) continue;
      const [u1, u2] =
        currentUserId.toString() < pid ? [currentUserId, pid] : [pid, currentUserId];
      const isFriend = await Friendship.findOne({ user1: u1, user2: u2 });
      if (!isFriend) {
        throw new ValidationError('You can only add friends to a group');
      }
    }

    const chat = await getOrCreateChat(participantIds, true, groupNameStr, currentUserId);

    await cacheService.invalidateChatsForUsers(participantIds);

    const chatDoc = await Chat.findById(chat._id)
      .populate('participants', 'name email avatar connectId status lastSeen bio')
      .populate('lastMessage')
      .lean();

    const chatIds = [chat._id.toString()];
    const unreadMap = await getUnreadCountsForChats(chatIds, currentUserId);

    const response = {
      id: chat._id.toString(),
      name: groupNameStr,
      isGroup: true,
      receiverId: null,
      receiverAvatar: null,
      receiverStatus: null,
      receiverLastSeen: null,
      createdBy: chatDoc?.createdBy?.toString() || null,
      groupAvatar: chatDoc?.groupAvatar || null,
      groupBio: chatDoc?.groupBio || null,
      participantIds: chatDoc?.participants?.map((p) => p._id?.toString()).filter(Boolean) || [],
      participants: chatDoc?.participants,
      lastMessage: chatDoc?.lastMessage ? decryptLastMessage(chatDoc.lastMessage) : null,
      unreadCount: unreadMap[chat._id.toString()] ?? 0,
    };

    res.json({ success: true, chat: response });
  } catch (err) {
    next(err);
  }
};

export const addMembers = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const { participantIds: rawIds } = req.body;

    if (!Array.isArray(rawIds) || rawIds.length < 1) {
      throw new ValidationError('At least one participant is required');
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());

    if (String(adminId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, message: 'Only the group admin can add members' });
    }

    const existingIds = new Set(participants.map((p) => (p._id?.toString?.() || p.toString())));
    const toAdd = rawIds.map(String).filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      return res.status(400).json({ success: false, message: 'All selected users are already in the group' });
    }

    for (const pid of toAdd) {
      const [u1, u2] =
        currentUserId.toString() < pid ? [currentUserId, pid] : [pid, currentUserId];
      const isFriend = await Friendship.findOne({ user1: u1, user2: u2 });
      if (!isFriend) {
        throw new ValidationError('You can only add friends to a group');
      }
    }

    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { $addToSet: { participants: { $each: toAdd } } },
      { new: true },
    )
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const allParticipantIds = (updated.participants || []).map((p) => p._id?.toString()).filter(Boolean);
    await cacheService.invalidateChatsForUsers(allParticipantIds);

    const response = {
      id: updated._id.toString(),
      name: updated.groupName || 'Group',
      isGroup: true,
      createdBy: updated.createdBy?.toString?.() || null,
      groupAvatar: updated.groupAvatar || null,
      groupBio: updated.groupBio || null,
      participantIds: allParticipantIds,
      participants: updated.participants,
      lastMessage: updated.lastMessage ? decryptLastMessage(updated.lastMessage) : null,
    };

    res.json({ success: true, chat: response, addedIds: toAdd });
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

export const getChatProfile = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;

    const chat = await Chat.findById(chatId)
      .populate('participants', 'name avatar connectId status lastSeen bio')
      .lean();

    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

    const isParticipant = (chat.participants || []).some(
      (p) => (p._id?.toString?.() || p.toString()) === currentUserId.toString(),
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const subAdminIds = (chat.subAdmins || []).map((s) => String(s?.toString?.() || s)).filter(Boolean);
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());

    if (chat.isGroup) {
      const currentIdStr = currentUserId.toString();
      const isAdmin = String(adminId) === currentIdStr;
      const isSubAdmin = subAdminIds.some((sid) => String(sid) === currentIdStr);
      const participantList = participants.map((p) => {
        const id = p._id?.toString?.() || p.toString();
        const pIsAdmin = String(id) === String(adminId);
        const pIsSubAdmin = subAdminIds.some((sid) => String(sid) === String(id));
        const canKickThis =
          id !== currentIdStr &&
          (isAdmin ? !pIsAdmin : isSubAdmin && !pIsAdmin && !pIsSubAdmin);
        const canAssignSubAdmin = isAdmin && !pIsAdmin && !pIsSubAdmin;
        const canRemoveSubAdmin = isAdmin && pIsSubAdmin;
        const isSelf = id === currentIdStr;
        return {
          id,
          name: p.name,
          avatar: p.avatar,
          connectId: p.connectId,
          isAdmin: pIsAdmin,
          isSubAdmin: pIsSubAdmin,
          canManage: canKickThis,
          canAssignAdmin: isAdmin && !pIsAdmin,
          canAssignSubAdmin,
          canRemoveSubAdmin,
          canLeave: isSelf,
        };
      });
      return res.json({
        success: true,
        profile: {
          id: chat._id.toString(),
          name: chat.groupName || 'Group',
          isGroup: true,
          groupAvatar: chat.groupAvatar || null,
          groupBio: chat.groupBio || null,
          createdBy: createdById || adminId,
          canEdit: isAdmin,
          canDelete: isAdmin,
          participants: participantList,
        },
      });
    }

    const other = participants.find((p) => (p._id?.toString?.() || p.toString()) !== currentUserId.toString());
    if (!other) return res.status(404).json({ success: false, message: 'Chat partner not found' });

    const otherId = other._id?.toString?.() || other.toString();
    const [u1, u2] =
      currentUserId.toString() < otherId ? [currentUserId, otherId] : [otherId, currentUserId];
    const isFriend = await Friendship.findOne({ user1: u1, user2: u2 });
    if (!isFriend) {
      return res.status(403).json({ success: false, message: 'You can only view profiles of friends' });
    }

    return res.json({
      success: true,
      profile: {
        id: otherId,
        name: other.name,
        avatar: other.avatar,
        bio: other.bio || null,
        connectId: other.connectId,
        status: other.status || 'offline',
        lastSeen: other.lastSeen,
        isGroup: false,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateGroupProfile = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const { groupName, groupAvatar, groupBio } = req.body;

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());
    if (String(adminId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, message: 'Only the group admin can edit the profile' });
    }

    const updates = {};
    if (typeof groupName === 'string' && groupName.trim()) {
      updates.groupName = groupName.trim().slice(0, 100);
    }
    if (typeof groupAvatar === 'string') updates.groupAvatar = groupAvatar;
    if (typeof groupBio === 'string') updates.groupBio = groupBio.slice(0, 200);

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, chat: await Chat.findById(chatId).lean() });
    }

    const updated = await Chat.findByIdAndUpdate(chatId, { $set: updates }, { new: true })
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    await cacheService.invalidateChatsForUsers(chat.participants);

    const chatIdStr = chat._id?.toString() || chatId;
    const unreadMap = await getUnreadCountsForChats([chatIdStr], currentUserId);

    const response = {
      id: updated._id.toString(),
      name: updated.groupName || 'Group',
      isGroup: true,
      createdBy: updated.createdBy?.toString?.() || null,
      groupAvatar: updated.groupAvatar || null,
      groupBio: updated.groupBio || null,
      participantIds: (updated.participants || []).map((p) => p._id?.toString()).filter(Boolean),
      participants: updated.participants,
      lastMessage: updated.lastMessage ? decryptLastMessage(updated.lastMessage) : null,
      unreadCount: unreadMap[chatIdStr] ?? 0,
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

export const deleteGroup = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());
    if (String(adminId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, message: 'Only the group admin can delete the group' });
    }

    const participantIds = (chat.participants || []).map((p) => p._id?.toString?.() || p.toString()).filter(Boolean);

    await Message.deleteMany({ chat: chatId });
    await ChatReadState.deleteMany({ chat: chatId });
    await Chat.findByIdAndDelete(chatId);

    await cacheService.invalidateChatsForUsers(participantIds);

    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
};

export const kickMember = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const subAdminIds = (chat.subAdmins || []).map((s) => String(s?.toString?.() || s)).filter(Boolean);
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());
    const isAdmin = String(adminId) === String(currentUserId);
    const isSubAdmin = subAdminIds.some((sid) => String(sid) === String(currentUserId));
    const targetStr = String(targetUserId);
    const targetIsAdmin = String(targetStr) === String(adminId);
    const targetIsSubAdmin = subAdminIds.some((sid) => String(sid) === targetStr);

    if (!isAdmin && !isSubAdmin) {
      return res.status(403).json({ success: false, message: 'Only admin or sub-admin can remove members' });
    }
    if (isSubAdmin && targetIsAdmin) {
      return res.status(403).json({ success: false, message: 'Sub-admin cannot remove the group admin' });
    }
    if (isSubAdmin && targetIsSubAdmin) {
      return res.status(403).json({ success: false, message: 'Sub-admin can only remove regular members' });
    }
    const isParticipant = (chat.participants || []).some(
      (p) => (p._id?.toString?.() || p.toString()) === targetStr,
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'User is not in this group' });
    }

    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { participants: targetUserId, subAdmins: targetUserId } },
      { new: true },
    )
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const chatIdStr = chat._id?.toString() || chatId;
    const allAffected = [
      ...(chat.participants || []).map((p) => p._id?.toString?.() || p.toString()),
      targetStr,
    ];
    await cacheService.invalidateChatsForUsers(allAffected);

    const response = {
      id: updated._id.toString(),
      name: updated.groupName || 'Group',
      isGroup: true,
      createdBy: updated.createdBy?.toString?.() || null,
      groupAvatar: updated.groupAvatar || null,
      groupBio: updated.groupBio || null,
      participantIds: (updated.participants || []).map((p) => p._id?.toString()).filter(Boolean),
      participants: updated.participants,
      lastMessage: updated.lastMessage ? decryptLastMessage(updated.lastMessage) : null,
    };

    res.json({ success: true, chat: response, removedUserId: targetStr });
  } catch (err) {
    next(err);
  }
};

export const assignAdmin = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());
    if (String(adminId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, message: 'Only the group admin can assign admin' });
    }

    const targetStr = String(targetUserId);
    const isParticipant = (chat.participants || []).some(
      (p) => (p._id?.toString?.() || p.toString()) === targetStr,
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'User is not in this group' });
    }

    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { createdBy: targetUserId, $pull: { subAdmins: targetUserId } },
      { new: true },
    )
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const participantIds = (chat.participants || []).map((p) => p._id?.toString?.() || p.toString());
    await cacheService.invalidateChatsForUsers(participantIds);

    const response = {
      id: updated._id.toString(),
      name: updated.groupName || 'Group',
      isGroup: true,
      createdBy: updated.createdBy?.toString?.() || null,
      groupAvatar: updated.groupAvatar || null,
      groupBio: updated.groupBio || null,
      participantIds: (updated.participants || []).map((p) => p._id?.toString()).filter(Boolean),
      participants: updated.participants,
      lastMessage: updated.lastMessage ? decryptLastMessage(updated.lastMessage) : null,
    };

    res.json({ success: true, chat: response, newAdminId: targetStr });
  } catch (err) {
    next(err);
  }
};

export const assignSubAdmin = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const subAdminIds = (chat.subAdmins || []).map((s) => String(s?.toString?.() || s)).filter(Boolean);
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());
    if (String(adminId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, message: 'Only the group admin can assign sub-admin' });
    }

    const targetStr = String(targetUserId);
    const targetIsAdmin = String(targetStr) === String(adminId);
    const targetIsSubAdmin = subAdminIds.some((sid) => String(sid) === targetStr);
    if (targetIsAdmin) {
      return res.status(400).json({ success: false, message: 'Admin is already the group owner' });
    }
    if (targetIsSubAdmin) {
      return res.status(400).json({ success: false, message: 'User is already a sub-admin' });
    }

    const isParticipant = (chat.participants || []).some(
      (p) => (p._id?.toString?.() || p.toString()) === targetStr,
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'User is not in this group' });
    }

    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { $addToSet: { subAdmins: targetUserId } },
      { new: true },
    )
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const participantIds = (chat.participants || []).map((p) => p._id?.toString?.() || p.toString());
    await cacheService.invalidateChatsForUsers(participantIds);

    const response = {
      id: updated._id.toString(),
      name: updated.groupName || 'Group',
      isGroup: true,
      createdBy: updated.createdBy?.toString?.() || null,
      groupAvatar: updated.groupAvatar || null,
      groupBio: updated.groupBio || null,
      participantIds: (updated.participants || []).map((p) => p._id?.toString()).filter(Boolean),
      participants: updated.participants,
      lastMessage: updated.lastMessage ? decryptLastMessage(updated.lastMessage) : null,
    };

    res.json({ success: true, chat: response, newSubAdminId: targetStr });
  } catch (err) {
    next(err);
  }
};

export const removeSubAdmin = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const subAdminIds = (chat.subAdmins || []).map((s) => String(s?.toString?.() || s)).filter(Boolean);
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());

    if (String(adminId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, message: 'Only the group admin can remove sub-admin' });
    }

    const targetStr = String(targetUserId);
    const targetIsSubAdmin = subAdminIds.some((sid) => String(sid) === targetStr);
    if (!targetIsSubAdmin) {
      return res.status(400).json({ success: false, message: 'User is not a sub-admin' });
    }

    const isParticipant = (chat.participants || []).some(
      (p) => (p._id?.toString?.() || p.toString()) === targetStr,
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'User is not in this group' });
    }

    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { subAdmins: targetUserId } },
      { new: true },
    )
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const participantIds = (chat.participants || []).map((p) => p._id?.toString?.() || p.toString());
    await cacheService.invalidateChatsForUsers(participantIds);

    const response = {
      id: updated._id.toString(),
      name: updated.groupName || 'Group',
      isGroup: true,
      createdBy: updated.createdBy?.toString?.() || null,
      groupAvatar: updated.groupAvatar || null,
      groupBio: updated.groupBio || null,
      participantIds: (updated.participants || []).map((p) => p._id?.toString()).filter(Boolean),
      participants: updated.participants,
      lastMessage: updated.lastMessage ? decryptLastMessage(updated.lastMessage) : null,
    };

    res.json({ success: true, chat: response, removedSubAdminId: targetStr });
  } catch (err) {
    next(err);
  }
};

export const leaveGroup = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (!chat.isGroup) {
      return res.status(400).json({ success: false, message: 'Not a group chat' });
    }

    const currentIdStr = String(currentUserId);
    const isParticipant = (chat.participants || []).some(
      (p) => (p._id?.toString?.() || p.toString()) === currentIdStr,
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'You are not in this group' });
    }

    const participants = chat.participants || [];
    const createdById = chat.createdBy?.toString?.() || null;
    const subAdminIds = (chat.subAdmins || []).map((s) => String(s?.toString?.() || s)).filter(Boolean);
    const adminId = createdById || (participants[0]?._id?.toString?.() ?? participants[0]?.toString?.());
    const isAdmin = String(adminId) === currentIdStr;

    const remainingParticipants = participants
      .filter((p) => (p._id?.toString?.() || p.toString()) !== currentIdStr)
      .map((p) => p._id?.toString?.() || p.toString());

    const pullFromSubAdmins = [currentUserId];
    let setCreatedBy = null;

    if (isAdmin && remainingParticipants.length > 0) {
      const newAdminId = subAdminIds.find((s) => remainingParticipants.includes(s)) || remainingParticipants[0];
      setCreatedBy = newAdminId;
      pullFromSubAdmins.push(newAdminId);
    }

    const update = {
      $pull: {
        participants: currentUserId,
        subAdmins: { $in: pullFromSubAdmins },
      },
      ...(setCreatedBy && { $set: { createdBy: setCreatedBy } }),
    };

    await Chat.findByIdAndUpdate(chatId, update, { new: true })
      .populate('participants', 'name avatar connectId status lastSeen')
      .populate('lastMessage')
      .lean();

    const allAffected = [
      ...(chat.participants || []).map((p) => p._id?.toString?.() || p.toString()),
      currentIdStr,
    ];
    await cacheService.invalidateChatsForUsers(allAffected);

    res.json({ success: true, message: 'Left the group' });
  } catch (err) {
    next(err);
  }
};

