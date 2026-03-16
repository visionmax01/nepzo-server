import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export const connectDatabase = async () => {
  const maxRetries = 5;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(env.mongoUri, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10000,
      });
      logger.info('MongoDB connected');
      break;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${attempt} failed`, err);
      if (attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

