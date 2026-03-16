import { Chat } from '../models/Chat.js';

export const getOrCreateChat = async (participantIds, isGroup = false, groupName) => {
  if (!Array.isArray(participantIds) || participantIds.length < 2) {
    throw new Error('At least two participants are required');
  }

  const existing = await Chat.findOne({
    isGroup,
    participants: { $all: participantIds, $size: participantIds.length },
  });

  if (existing) return existing;

  const chat = await Chat.create({
    participants: participantIds,
    isGroup,
    groupName,
  });

  return chat;
};

export const listChatsForUser = async (userId) => {
  const chats = await Chat.find({ participants: userId })
    .populate('participants', 'name email avatar connectId status lastSeen')
    .populate('lastMessage')
    .sort({ updatedAt: -1 })
    .lean();

  return chats;
};

