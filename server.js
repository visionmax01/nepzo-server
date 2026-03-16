import http from 'http';
import dotenv from 'dotenv';
import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { connectDatabase } from './src/config/database.js';
import { initSocket } from './src/config/socket.js';
import { ensureMinioBucket } from './src/config/minio.js';
import { logger } from './src/utils/logger.js';
import { connectCache, disconnectCache } from './src/config/cache.js';

dotenv.config();

const start = async () => {
  try {
    await connectDatabase();
    await ensureMinioBucket();
    await connectCache();

    const server = http.createServer(app);
    initSocket(server);

    // Allow long uploads (50MB) - default 0 means no timeout
    server.timeout = 0;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    server.listen(env.port, async () => {
      logger.info(`NepZo backend listening on port ${env.port}`);
      try {
        const { encrypt } = await import('./src/services/encryptionService.js');
        const test = encrypt('test');
        logger.info(`Message encryption: ${test?.length > 20 ? 'ENABLED' : 'DISABLED'}`);
      } catch (e) {
        logger.warn('Message encryption check failed:', e?.message);
      }
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
};

start();

const shutdown = async () => {
  await disconnectCache();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

