import { registerChatSocket } from './chatSocket.js';
import { registerPresenceSocket } from './presenceSocket.js';
import { registerCallSocket } from './callSocket.js';

export const registerSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    registerChatSocket(io, socket);
    registerPresenceSocket(io, socket);
    registerCallSocket(io, socket);
  });
};

