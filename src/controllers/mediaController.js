import { minioClient } from '../config/minio.js';
import { env } from '../config/env.js';
import { canUserAccessMedia } from '../services/messageService.js';
import { decryptBuffer } from '../services/encryptionService.js';

const getContentType = (stat, key) => {
  const meta = stat?.metaData || {};
  const original = meta['x-original-content-type'] || meta['X-Original-Content-Type'];
  if (original) return Array.isArray(original) ? original[0] : original;
  const ext = (key || '').split('.').pop()?.toLowerCase();
  const map = { m4a: 'audio/mp4', mp3: 'audio/mpeg', mp4: 'video/mp4', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png' };
  return map[ext] || 'application/octet-stream';
};

export const streamMedia = async (req, res, next) => {
  try {
    let key = req.params.key;
    if (Array.isArray(key)) {
      key = key.join('/');
    }
    if (!key) {
      res.status(400).json({ error: 'Missing key' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const canAccess = await canUserAccessMedia(key, userId);
    if (!canAccess) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const [stat, stream] = await Promise.all([
      minioClient.statObject(env.minio.bucket, key).catch(() => null),
      minioClient.getObject(env.minio.bucket, key),
    ]);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const encryptedBuffer = Buffer.concat(chunks);
    const decryptedBuffer = decryptBuffer(encryptedBuffer);

    const contentType = getContentType(stat, key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', decryptedBuffer.length);
    res.send(decryptedBuffer);
  } catch (err) {
    next(err);
  }
};
