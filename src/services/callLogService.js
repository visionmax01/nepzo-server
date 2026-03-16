import { CallLog } from '../models/CallLog.js';
import { User } from '../models/User.js';

export const createCallLog = async (userId, data) => {
  const log = await CallLog.create({
    user: userId,
    peerId: data.peerId,
    peerName: data.peerName || 'Unknown',
    peerAvatar: data.peerAvatar,
    callType: data.callType || 'voice',
    direction: data.direction || 'outgoing',
    durationSeconds: data.durationSeconds ?? 0,
    status: data.status || 'answered',
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
  });
  return log;
};

export const getCallLogsForUser = async (userId, { limit = 100 } = {}) => {
  const logs = await CallLog.find({ user: userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
  const peerIds = [...new Set(logs.map((l) => l.peerId).filter(Boolean))];
  const peers = peerIds.length > 0
    ? await User.find({ _id: { $in: peerIds } }).select('_id avatar name').lean()
    : [];
  const peerMap = Object.fromEntries(peers.map((p) => [p._id.toString(), p]));
  return logs.map((l) => {
    const peer = peerMap[l.peerId];
    const peerAvatar = peer?.avatar ?? l.peerAvatar;
    const peerName = peer?.name ?? l.peerName;
    return {
      id: l._id.toString(),
      peerId: l.peerId,
      peerName: peerName || l.peerName,
      peerAvatar: peerAvatar || l.peerAvatar,
      callType: l.callType,
      direction: l.direction,
      durationSeconds: l.durationSeconds,
      status: l.status,
      timestamp: l.timestamp?.getTime?.() ?? l.timestamp,
    };
  });
};

/**
 * Delete call logs for a user within an optional date range.
 * @param {string} userId
 * @param {{ from?: Date, to?: Date }} range
 * @returns {{ deletedCount: number }}
 */
export const clearCallLogsForUser = async (userId, { from, to } = {}) => {
  const query = { user: userId };
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from);
    if (to)   query.timestamp.$lte = new Date(to);
  }
  const result = await CallLog.deleteMany(query);
  return { deletedCount: result.deletedCount };
};

export const getRecentMissedCallsForUser = async (userId, { since } = {}) => {
  const query = { user: userId, direction: 'incoming', status: 'missed' };
  if (since) {
    query.timestamp = { $gt: new Date(since) };
  } else {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    query.timestamp = { $gt: dayAgo };
  }
  const logs = await CallLog.find(query).sort({ timestamp: -1 }).limit(20).lean();
  return logs.map((l) => ({
    id: l._id.toString(),
    peerId: l.peerId,
    peerName: l.peerName,
    peerAvatar: l.peerAvatar,
    callType: l.callType,
    timestamp: l.timestamp?.getTime?.() ?? l.timestamp,
  }));
};
