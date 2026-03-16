import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Block } from '../models/Block.js';
import { createCallLog } from '../services/callLogService.js';
import { sendMiscalledNotification, sendIncomingCallNotification } from '../services/pushNotificationService.js';
import { isUserOnline } from '../config/socket.js';

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

export const registerCallSocket = (io, socket) => {
  const user = authenticateSocket(socket);
  if (!user) {
    socket.disconnect(true);
    return;
  }

  socket.on('call_user', async ({ calleeId, callType }) => {
    const blocked = await Block.exists({
      $or: [
        { blocker: user.id, blocked: calleeId },
        { blocker: calleeId, blocked: user.id },
      ],
    });
    if (blocked) return;

    let callerName = 'Unknown';
    let callerAvatar = null;
    try {
      const caller = await User.findById(user.id).select('name avatar').lean();
      callerName = caller?.name || 'Unknown';
      callerAvatar = caller?.avatar ?? null;
    } catch (err) {
      console.error('Failed to fetch caller for incoming_call:', err);
    }

    const calleeOnline = await isUserOnline(calleeId);

    io.to(`user:${calleeId}`).emit('incoming_call', {
      callerId: user.id,
      callType,
      callerName,
      callerAvatar,
    });

    if (calleeOnline) {
      socket.emit('call_ringing', { calleeId });
    } else {
      sendIncomingCallNotification(calleeId, callerName, callType).catch(() => {});
    }
  });

  socket.on('accept_call', ({ otherUserId }) => {
    io.to(`user:${otherUserId}`).emit('accept_call', { userId: user.id });
  });

  socket.on('reject_call', ({ otherUserId }) => {
    io.to(`user:${otherUserId}`).emit('reject_call', { userId: user.id });
  });

  socket.on('offer', ({ otherUserId, offer }) => {
    io.to(`user:${otherUserId}`).emit('offer', { userId: user.id, offer });
  });

  socket.on('answer', ({ otherUserId, answer }) => {
    io.to(`user:${otherUserId}`).emit('answer', { userId: user.id, answer });
  });

  socket.on('ice_candidate', ({ otherUserId, candidate }) => {
    io.to(`user:${otherUserId}`).emit('ice_candidate', { userId: user.id, candidate });
  });

  socket.on('end_call', async ({ otherUserId, callType, status, durationSeconds, timestamp }) => {
    const calleeId = otherUserId;
    const callerId = user.id;
    const calleeStatus = status === 'answered' ? 'answered' : 'missed';
    let callerName = 'Unknown';
    try {
      const caller = await User.findById(callerId).select('name avatar').lean();
      callerName = caller?.name || 'Unknown';
      await createCallLog(calleeId, {
        peerId: callerId,
        peerName: callerName,
        peerAvatar: caller?.avatar,
        callType: callType || 'voice',
        direction: 'incoming',
        durationSeconds: durationSeconds ?? 0,
        status: calleeStatus,
        timestamp: timestamp || Date.now(),
      });
    } catch (err) {
      console.error('Failed to create callee call log:', err);
    }
    if (calleeStatus === 'missed') {
      sendMiscalledNotification(calleeId, callerName).catch(() => {});
    }
    io.to(`user:${calleeId}`).emit('end_call', { userId: user.id });
  });
};

