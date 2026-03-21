import { env } from '../config/env.js';

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/** Add explicit TCP transport alongside default (UDP) for restrictive networks. */
const turnUrlsWithTcp = (turnUrl) => {
  if (!turnUrl) return [];
  if (turnUrl.includes('transport=')) {
    return [turnUrl];
  }
  const tcp = turnUrl.includes('?') ? `${turnUrl}&transport=tcp` : `${turnUrl}?transport=tcp`;
  return [turnUrl, tcp];
};

export const getWebRTCConfig = async (req, res) => {
  try {
    const iceServers = [...DEFAULT_STUN_SERVERS];

    const turnUrl = env.webrtc?.turnUrl;
    const turnUsername = env.webrtc?.turnUsername;
    const turnCredential = env.webrtc?.turnCredential;

    const turnReady = !!(turnUrl && turnUsername && turnCredential);
    if (process.env.NODE_ENV !== 'production') {
      if (turnReady) {
        console.log('[WebRTC] TURN relay enabled (STUN + TURN in ICE config)');
      } else {
        console.warn(
          '[WebRTC] TURN not configured (TURN_URL / TURN_USERNAME / TURN_CREDENTIAL) — calls may fail on mobile data or symmetric NAT',
        );
      }
    }

    if (turnReady) {
      const urls = turnUrlsWithTcp(turnUrl);
      iceServers.push({
        urls,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    // Mobile clients must always receive a JSON body; CDNs/proxies may otherwise return 304 with no body.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.json({ iceServers });
  } catch (err) {
    res.status(500).json({
      iceServers: DEFAULT_STUN_SERVERS,
    });
  }
};
