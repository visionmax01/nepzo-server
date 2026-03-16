import sharp from 'sharp';
import { minioClient } from '../config/minio.js';
import { uploadToS3 } from '../config/s3.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { encryptBuffer } from './encryptionService.js';

const s3Queue = [];
let processingQueue = false;

const isS3Configured = () => {
  const bucket = env.s3?.bucket || '';
  return bucket && !bucket.includes('your-s3-bucket') && !bucket.includes('your-aws-region');
};

const enqueueS3Upload = (task) => {
  if (!isS3Configured()) return;
  s3Queue.push(task);
  if (!processingQueue) {
    processingQueue = true;
    // Fire and forget
    // eslint-disable-next-line no-void
    void processQueue();
  }
};

const processQueue = async () => {
  while (s3Queue.length > 0) {
    const task = s3Queue.shift();
    if (!isS3Configured()) continue;
    try {
      const stream = await minioClient.getObject(env.minio.bucket, task.key);
      const chunks = [];
      // eslint-disable-next-line no-await-in-loop
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      await uploadToS3({
        key: task.key,
        body: buffer,
        contentType: task.contentType,
      });
      logger.info(`Backed up to S3: ${task.key}`);
    } catch (err) {
      logger.error('Failed to back up object to S3', err);
    }
  }
  processingQueue = false;
};

const FOLDER_MAP = {
  profile: 'profile-image/',
  'chat-image': 'chat-image/',
  'chat-video': 'chat-video/',
  'chat-audio': 'chat-audio/',
};

const getFolderPrefix = (type) => FOLDER_MAP[type] || 'chat-image/';

export const deleteObject = async (key) => {
  if (!key || typeof key !== 'string') return;
  try {
    await minioClient.removeObject(env.minio.bucket, key);
    logger.info(`Deleted object from storage: ${key}`);
  } catch (err) {
    logger.error('Failed to delete object from storage', { key, err });
  }
};

export const handleUpload = async (file, type = 'chat-image') => {
  if (!file) {
    throw new Error('No file provided');
  }

  const isImage = file.mimetype.startsWith('image/');
  let buffer = file.buffer;

  if (isImage) {
    buffer = await sharp(file.buffer).rotate().jpeg({ quality: 80 }).toBuffer();
  }

  const encryptedBuffer = encryptBuffer(buffer);

  const folder = getFolderPrefix(type);
  const key = `${folder}${Date.now()}-${file.originalname || 'file'}`;

  await minioClient.putObject(env.minio.bucket, key, encryptedBuffer, {
    'Content-Type': 'application/octet-stream',
    'X-Original-Content-Type': file.mimetype,
  });

  enqueueS3Upload({ key, contentType: file.mimetype });

  return { key, url: `media/${key}` };
};

