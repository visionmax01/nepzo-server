import dotenv from 'dotenv';

dotenv.config({ debug: true });

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  clientOrigin: required('CLIENT_ORIGIN', '*'),
  logLevel: process.env.LOG_LEVEL || 'info',

  mongoUri: required('MONGODB_URI'),

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: required('JWT_EXPIRES_IN', '7d'),
  },

  google: {
    clientId: required('GOOGLE_CLIENT_ID'),
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || undefined,
  },

  minio: {
    endPoint: required('MINIO_ENDPOINT'),
    port: Number(required('MINIO_PORT')),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: required('MINIO_ACCESS_KEY'),
    secretKey: required('MINIO_SECRET_KEY'),
    bucket: required('MINIO_BUCKET'),
  },

  s3: {
    region: required('AWS_REGION'),
    accessKeyId: required('AWS_ACCESS_KEY_ID'),
    secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
    bucket: required('S3_BUCKET'),
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'nepzo-default-encryption-key-change-in-production-32chars',
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    url: process.env.CACHE_URL || undefined,
    host: process.env.CACHE_HOST || 'localhost',
    port: Number(process.env.CACHE_PORT) || 6379,
    username: process.env.CACHE_USERNAME || undefined,
    password: process.env.CACHE_PASSWORD || undefined,
    ttlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 300,
    keyPrefix: process.env.CACHE_KEY_PREFIX || 'nepzo:v1:',
    connectTimeoutMs: Number(process.env.CACHE_CONNECT_TIMEOUT_MS) || 5000,
    useTls: process.env.CACHE_USE_TLS === 'true',
  },
};

