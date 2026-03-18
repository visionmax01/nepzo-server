import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Block } from '../models/Block.js';
import { createCallLog } from '../services/callLogService.js';
import { sendMiscalledNotification, sendIncomingCallNotification } from '../services/pushNotificationService.js';

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
    }

    io.to(`user:${calleeId}`).emit('incoming_call', {
      callerId: user.id,
      callType,
      callerName,
      callerAvatar,
    });

    // Always emit call_ringing so caller gets ringing feedback (callee may be reached via push when app in background)
    socket.emit('call_ringing', { calleeId });

    // Always send push: callee may be "online" (socket connected) but app in background
    sendIncomingCallNotification(calleeId, user.id, callerName, callType, callerAvatar).catch(() => {});
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

  socket.on('end_call', async ({ otherUserId, callType, status, durationSeconds, timestamp, isCaller }) => {
    const whoEndedIsCaller = isCaller === true;
    const callerId = whoEndedIsCaller ? user.id : otherUserId;
    const calleeId = whoEndedIsCaller ? otherUserId : user.id;
    const answered = status === 'answered';
    const callerStatus = answered ? 'answered' : 'cancelled';
    const calleeStatus = answered ? 'answered' : 'missed';

    const remoteUserId = otherUserId;
    const remoteIsCaller = whoEndedIsCaller ? false : true;
    const remoteDirection = remoteIsCaller ? 'outgoing' : 'incoming';
    const remoteStatus = remoteIsCaller ? callerStatus : calleeStatus;
    const peerId = remoteIsCaller ? calleeId : callerId;

    let peerName = 'Unknown';
    let peerAvatar = null;
    try {
      const peer = await User.findById(peerId).select('name avatar').lean();
      peerName = peer?.name || 'Unknown';
      peerAvatar = peer?.avatar ?? null;
      await createCallLog(remoteUserId, {
        peerId,
        peerName,
        peerAvatar,
        callType: callType || 'voice',
        direction: remoteDirection,
        durationSeconds: durationSeconds ?? 0,
        status: remoteStatus,
        timestamp: timestamp || Date.now(),
      });
    } catch (err) {
    }
    if (calleeStatus === 'missed') {
      const caller = await User.findById(callerId).select('name').lean();
      sendMiscalledNotification(calleeId, caller?.name || 'Unknown').catch(() => {});
    }
    io.to(`user:${otherUserId}`).emit('end_call', { userId: user.id });
  });
};

