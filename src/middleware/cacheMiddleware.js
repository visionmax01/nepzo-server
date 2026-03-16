// Simple cache middleware factory for GET endpoints.
// Expects a function that derives a cache key from the request.
import { cacheClient } from '../config/cache.js';

export const cacheMiddleware = (keyFn) => async (req, res, next) => {
  if (req.method !== 'GET') return next();

  const key = keyFn(req);
  if (!key) return next();

  const hit = await cacheClient.get(key);
  if (!hit) return next();

  res.json(hit);
};

