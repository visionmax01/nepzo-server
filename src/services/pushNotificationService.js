import { getMessaging } from './firebaseAdmin.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { FriendRequest } from '../models/FriendRequest.js';

const isFcmToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  if (token.startsWith('ExponentPushToken[')) return false;
  return token.length > 50;
};

export const getBadgeCountForUser = async (userId) => {
  try {
    const [unreadMessages, pendingFriendRequests] = await Promise.all([
      Message.countDocuments({ receiver: userId, seen: false }),
      FriendRequest.countDocuments({ to: userId, status: 'pending' }),
    ]);
    return Math.min(unreadMessages + pendingFriendRequests, 99);
  } catch {
    return 0;
  }
};

const stringifyData = (obj) => {
  const result = {};
  for (const [k, v] of Object.entries(obj || {})) {
    result[k] = String(v ?? '');
  }
  return result;
};

const sendPushNotification = async (userId, { title, body, data, channelId }) => {
  try {
    const user = await User.findById(userId).select('pushToken').lean();
    const pushToken = user?.pushToken;
    if (!pushToken) {
      console.warn(`[Push] No push token for user ${userId} (${data?.type || 'unknown'})`);
      return;
    }
    if (!isFcmToken(pushToken)) {
      console.warn(`[Push] Invalid token format for user ${userId} (${data?.type || 'unknown'}) - may be old Expo token`);
      return;
    }

    const badge = await getBadgeCountForUser(userId);
    const dataPayload = stringifyData({ ...data, badge, channelId: channelId || 'default' });

    const messaging = getMessaging();
    await messaging.send({
      token: pushToken,
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: 'high',
        notification: {
          channelId: channelId || 'default',
          sound: 'default',
        },
      },
    });
    console.log(`[Push] Sent to user ${userId} (${data?.type || 'unknown'})`);
  } catch (err) {
    console.error(`[Push] Failed for user ${userId} (${data?.type || 'unknown'}):`, err);
  }
};

export const sendMiscalledNotification = async (calleeId, callerName) => {
  await sendPushNotification(calleeId, {
    title: 'Missed Call',
    body: `${callerName || 'Someone'} tried to call you`,
    data: { type: 'miscalled', callerName: callerName || 'Unknown' },
  });
};

const getMediaBody = (senderName, messageType) => {
  const name = senderName || 'Someone';
  const type = (messageType || '').toLowerCase();
  const mediaLabels = {
    file: 'sent you a file',
    image: 'sent you an image',
    video: 'sent you a video',
    audio: 'sent you a voice message',
  };
  const label = mediaLabels[type] || 'sent you a media message';
  return `${name} ${label}`;
};

export const sendMessageNotification = async (
  receiverId,
  senderName,
  messageText,
  chatId,
  messageType,
) => {
  const body = messageText
    ? `${senderName || 'Someone'}: ${messageText.slice(0, 100)}`
    : getMediaBody(senderName, messageType);
  await sendPushNotification(receiverId, {
    title: 'New Message',
    body,
    data: { type: 'message', senderName: senderName || 'Unknown', chatId: chatId || '' },
    channelId: 'messages',
  });
};

export const sendFriendRequestNotification = async (targetUserId, fromUserName) => {
  await sendPushNotification(targetUserId, {
    title: 'Friend Request',
    body: `${fromUserName || 'Someone'} sent you a friend request`,
    data: { type: 'friend_request', fromUserName: fromUserName || 'Unknown' },
  });
};

export const sendIncomingCallNotification = async (calleeId, callerName, callType) => {
  const typeLabel = callType === 'video' ? 'video' : 'voice';
  await sendPushNotification(calleeId, {
    title: 'Incoming Call',
    body: `${callerName || 'Someone'} is calling you (${typeLabel})`,
    data: { type: 'incoming_call', callerName: callerName || 'Unknown', callType: typeLabel },
  });
};
