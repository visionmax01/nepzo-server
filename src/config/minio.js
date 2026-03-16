import { Client } from 'minio';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const minioClient = new Client({
  endPoint: env.minio.endPoint,
  port: env.minio.port,
  useSSL: env.minio.useSSL,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

export const ensureMinioBucket = async () => {
  try {
    const exists = await minioClient.bucketExists(env.minio.bucket);
    if (!exists) {
      await minioClient.makeBucket(env.minio.bucket, '');
      logger.info(`Created MinIO bucket ${env.minio.bucket}`);
    }
  } catch (err) {
    logger.error('Error ensuring MinIO bucket', err);
    throw err;
  }
};

