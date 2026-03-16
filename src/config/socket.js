import { Server as SocketIOServer } from 'socket.io';
import { env } from './env.js';
import { registerSocketHandlers } from '../sockets/index.js';
import { logger } from '../utils/logger.js';

let ioInstance = null;

export const getIO = () => ioInstance;

export const isUserOnline = async (userId) => {
  if (!ioInstance) return false;
  const room = `user:${userId}`;
  const sockets = await ioInstance.in(room).fetchSockets();
  return sockets.length > 0;
};

export const initSocket = (httpServer) => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  ioInstance = io;

  io.on('connection', (socket) => {
    logger.info(`Socket connected ${socket.id}`);
  });

  registerSocketHandlers(io);

  return io;
};

