const activeCalls = new Map();

export const startCall = (callerId, calleeId, callType) => {
  const key = [callerId, calleeId].sort().join(':');
  activeCalls.set(key, { callerId, calleeId, callType, startedAt: Date.now() });
};

export const endCall = (callerId, calleeId) => {
  const key = [callerId, calleeId].sort().join(':');
  activeCalls.delete(key);
};

export const getActiveCall = (userId) => {
  for (const call of activeCalls.values()) {
    if (call.callerId === userId || call.calleeId === userId) {
      return call;
    }
  }
  return null;
};

