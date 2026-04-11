import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/** Normalize `urls` to string or array of strings for RN / WebRTC stacks. */
const normalizeIceServers = (iceServers) => {
  if (!Array.isArray(iceServers)) return [];
  return iceServers.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const next = { ...entry };
    if (next.urls != null) {
      if (Array.isArray(next.urls)) {
        next.urls = next.urls.map((u) => String(u));
      } else if (typeof next.urls === 'string') {
        next.urls = next.urls;
      }
    }
    return next;
  });
};

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
    if (turnReady) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[WebRTC] TURN relay enabled (STUN + TURN in ICE config)');
      }
    } else {
      const msg =
        'WebRTC TURN not configured (TURN_URL / TURN_USERNAME / TURN_CREDENTIAL). Cross-network calls will fail.';
      if (process.env.NODE_ENV === 'production') {
        logger.warn(msg);
      } else {
        console.warn(`[WebRTC] ${msg}`);
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

    const normalized = normalizeIceServers(iceServers);

    // Mobile clients must always receive a JSON body; CDNs/proxies may otherwise return 304 with no body.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.json({
      iceServers: normalized,
      turnRelayConfigured: turnReady,
    });
  } catch (err) {
    res.status(500).json({
      iceServers: normalizeIceServers(DEFAULT_STUN_SERVERS),
      turnRelayConfigured: false,
    });
  }
};
