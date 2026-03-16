import { createCallLog, getCallLogsForUser, clearCallLogsForUser } from '../services/callLogService.js';

export const createCallLogEntry = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { peerId, peerName, peerAvatar, callType, direction, durationSeconds, status, timestamp } = req.body;
    if (!peerId) {
      return res.status(400).json({ success: false, error: 'peerId is required' });
    }
    const log = await createCallLog(userId, {
      peerId,
      peerName,
      peerAvatar,
      callType,
      direction,
      durationSeconds,
      status,
      timestamp,
    });
    res.status(201).json({
      success: true,
      log: {
        id: log._id.toString(),
        peerId: log.peerId,
        peerName: log.peerName,
        peerAvatar: log.peerAvatar,
        callType: log.callType,
        direction: log.direction,
        durationSeconds: log.durationSeconds,
        status: log.status,
        timestamp: log.timestamp?.getTime?.() ?? log.timestamp,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getCallLogs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const logs = await getCallLogsForUser(userId, { limit });
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
};

export const clearCallLogs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.body || {};
    const { deletedCount } = await clearCallLogsForUser(userId, {
      from: from ? new Date(from) : undefined,
      to:   to   ? new Date(to)   : undefined,
    });
    res.json({ success: true, deletedCount });
  } catch (err) {
    next(err);
  }
};
