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

const sendIncomingCallPush = async (userId, data) => {
  try {
    const user = await User.findById(userId).select('pushToken').lean();
    const pushToken = user?.pushToken;
    if (!pushToken) return;
    if (!isFcmToken(pushToken)) return;
    const badge = await getBadgeCountForUser(userId);
    const dataPayload = stringifyData({ ...data, badge, channelId: 'incoming_call' });
    const typeLabel = data.callType === 'video' ? 'Video' : 'Voice';
    const messaging = getMessaging();
    await messaging.send({
      token: pushToken,
      notification: {
        title: 'Incoming Call',
        body: `${data.callerName || 'Unknown'} is calling you (${typeLabel})`,
      },
      data: dataPayload,
      android: {
        priority: 'high',
        notification: {
          channelId: 'incoming_call',
          sound: 'default',
          visibility: 'public',
          priority: 'max',
        },
      },
    });
  } catch (err) {
    const code = err?.errorInfo?.code || err?.code;
    const invalidTokenCodes = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ];
    if (invalidTokenCodes.includes(code)) {
      await User.findByIdAndUpdate(userId, { $unset: { pushToken: 1 } });
    }
  }
};

const sendPushNotification = async (userId, { title, body, data, channelId }) => {
  try {
    const user = await User.findById(userId).select('pushToken').lean();
    const pushToken = user?.pushToken;
    if (!pushToken) return;
    if (!isFcmToken(pushToken)) return;

    const badge = await getBadgeCountForUser(userId);
    const effectiveChannelId = channelId === 'messages' ? 'messages_v2' : 'default_v2';
    const dataPayload = stringifyData({ ...data, badge, channelId: effectiveChannelId });

    const messaging = getMessaging();
    await messaging.send({
      token: pushToken,
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: 'high',
        notification: {
          channelId: effectiveChannelId,
          sound: 'default',
        },
      },
    });
  } catch (err) {
    const code = err?.errorInfo?.code || err?.code;
    const invalidTokenCodes = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ];
    if (invalidTokenCodes.includes(code)) {
      await User.findByIdAndUpdate(userId, { $unset: { pushToken: 1 } });
    }
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

export const sendIncomingCallNotification = async (calleeId, callerId, callerName, callType, callerAvatar = null) => {
  const typeLabel = callType === 'video' ? 'video' : 'voice';
  const data = {
    type: 'incoming_call',
    callerId: callerId || '',
    callerName: callerName || 'Unknown',
    callType: typeLabel,
    callerAvatar: callerAvatar ?? '',
  };
  await sendIncomingCallPush(calleeId, data);
};
