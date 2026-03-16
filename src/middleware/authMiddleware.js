import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthError } from '../utils/errorTypes.js';

const getTokenFromRequest = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.query?.token || req.query?.access_token || null;
};

export const authMiddleware = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return next(new AuthError('Missing authorization token'));
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      connectId: payload.connectId,
    };
    return next();
  } catch (err) {
    return next(new AuthError('Invalid or expired token'));
  }
};

