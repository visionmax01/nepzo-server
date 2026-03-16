import { cacheClient } from '../config/cache.js';

const userKey = (id) => `user:${id}`;
const connectIdKey = (connectId) => `connectId:${connectId}`;
const friendsKey = (id) => `friends:${id}`;
const CHATS_CACHE_VERSION = 3;
const chatsKey = (id) => `chats:v${CHATS_CACHE_VERSION}:${id}`;

export const cacheService = {
  getUser: (id) => cacheClient.get(userKey(id)),
  setUser: (id, data) => cacheClient.set(userKey(id), data),
  invalidateUser: (id) => cacheClient.del(userKey(id)),

  getUserByConnectId: (connectId) => cacheClient.get(connectIdKey(connectId)),
  setUserByConnectId: (connectId, data) => cacheClient.set(connectIdKey(connectId), data),
  invalidateUserByConnectId: (connectId) => cacheClient.del(connectIdKey(connectId)),

  getFriends: (id) => cacheClient.get(friendsKey(id)),
  setFriends: (id, list) => cacheClient.set(friendsKey(id), list),
  invalidateFriends: (id) => cacheClient.del(friendsKey(id)),

  getChats: (id) => cacheClient.get(chatsKey(id)),
  setChats: (id, list) => cacheClient.set(chatsKey(id), list),
  invalidateChats: (id) => cacheClient.del(chatsKey(id)),

  invalidateChatsForUsers: async (userIds = []) => {
    const uniqueIds = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
    await Promise.all(uniqueIds.map((id) => cacheClient.del(chatsKey(id))));
  },

  invalidateFriendsForUsers: async (userIds = []) => {
    const uniqueIds = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
    await Promise.all(uniqueIds.map((id) => cacheClient.del(friendsKey(id))));
  },
};

