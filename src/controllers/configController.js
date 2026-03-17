import { env } from '../config/env.js';

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const getWebRTCConfig = async (req, res) => {
  try {
    const iceServers = [...DEFAULT_STUN_SERVERS];

    const turnUrl = env.webrtc?.turnUrl;
    const turnUsername = env.webrtc?.turnUsername;
    const turnCredential = env.webrtc?.turnCredential;

    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    res.json({ iceServers });
  } catch (err) {
    res.status(500).json({
      iceServers: DEFAULT_STUN_SERVERS,
    });
  }
};
