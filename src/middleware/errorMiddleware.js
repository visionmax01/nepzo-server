import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export const errorMiddleware = (err, req, res, next) => {
  logger.error('Unhandled error', err);

  const status = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    success: false,
    message,
  });
};

