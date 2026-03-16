import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { createClient } from 'redis';

class InMemoryCache {
  constructor() {
    this.store = new Map();
  }

  async set(key, value, ttlSeconds = env.cache.ttlSeconds) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key) {
    this.store.delete(key);
  }
}

class CacheClient {
  constructor() {
    this.memory = new InMemoryCache();
    this.redis = null;
    this.redisReady = false;
    this.redisDisabledWarned = false;
  }

  prefixedKey(key) {
    return `${env.cache.keyPrefix}${key}`;
  }

  async connect() {
    if (!env.cache.enabled) {
      logger.info('Cache disabled via CACHE_ENABLED=false. Using in-memory cache.');
      return;
    }

    if (this.redis) {
      return;
    }

    try {
      const options = env.cache.url
        ? {
            url: env.cache.url,
            socket: {
              connectTimeout: env.cache.connectTimeoutMs,
              tls: env.cache.useTls ? true : undefined,
              reconnectStrategy: () => false,
            },
          }
        : {
            socket: {
              host: env.cache.host,
              port: env.cache.port,
              connectTimeout: env.cache.connectTimeoutMs,
              tls: env.cache.useTls ? true : undefined,
              reconnectStrategy: () => false,
            },
            username: env.cache.username,
            password: env.cache.password,
          };

      this.redis = createClient(options);

      this.redis.on('ready', () => {
        this.redisReady = true;
        logger.info('Redis cache connected');
      });

      this.redis.on('error', (err) => {
        this.redisReady = false;
        logger.warn('Redis cache error; using in-memory fallback', err?.message || err);
      });

      this.redis.on('end', () => {
        this.redisReady = false;
        logger.warn('Redis cache connection closed; using in-memory fallback');
      });

      await this.redis.connect();
    } catch (err) {
      this.redisReady = false;
      logger.warn('Unable to connect to Redis; using in-memory fallback', err?.message || err);
    }
  }

  async get(key) {
    const fullKey = this.prefixedKey(key);

    if (this.redisReady && this.redis) {
      try {
        const raw = await this.redis.get(fullKey);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (err) {
        this.redisReady = false;
        logger.warn('Redis GET failed; falling back to memory cache', err?.message || err);
      }
    } else if (!env.cache.enabled && !this.redisDisabledWarned) {
      this.redisDisabledWarned = true;
      logger.info('Using in-memory cache only.');
    }

    return this.memory.get(fullKey);
  }

  async set(key, value, ttlSeconds = env.cache.ttlSeconds) {
    const fullKey = this.prefixedKey(key);
    const ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : env.cache.ttlSeconds;

    if (this.redisReady && this.redis) {
      try {
        await this.redis.set(fullKey, JSON.stringify(value), { EX: ttl });
        return;
      } catch (err) {
        this.redisReady = false;
        logger.warn('Redis SET failed; falling back to memory cache', err?.message || err);
      }
    }

    await this.memory.set(fullKey, value, ttl);
  }

  async del(key) {
    const fullKey = this.prefixedKey(key);

    if (this.redisReady && this.redis) {
      try {
        await this.redis.del(fullKey);
      } catch (err) {
        this.redisReady = false;
        logger.warn('Redis DEL failed; continuing with memory cache', err?.message || err);
      }
    }

    await this.memory.del(fullKey);
  }

  async disconnect() {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      // ignore disconnect errors on shutdown
    } finally {
      this.redis = null;
      this.redisReady = false;
    }
  }
}

export const cacheClient = new CacheClient();
export const connectCache = () => cacheClient.connect();
export const disconnectCache = () => cacheClient.disconnect();

