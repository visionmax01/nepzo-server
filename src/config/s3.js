import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3Client = new S3Client({
  region: env.s3.region,
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
});

export const uploadToS3 = async ({ key, body, contentType }) => {
  const command = new PutObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return `s3://${env.s3.bucket}/${key}`;
};

