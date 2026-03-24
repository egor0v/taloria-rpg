/**
 * Socket.io client wrapper
 */
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';
import { getCurrentUser } from './auth';

let socket: Socket | null = null;
let gameSocket: Socket | null = null;
let chatSocket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = getToken();
  socket = io('/', {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  return socket;
}

export function getGameSocket(): Socket {
  // Reuse if connected
  if (gameSocket?.connected) return gameSocket;

  // Disconnect old one if exists but disconnected
  if (gameSocket) {
    gameSocket.removeAllListeners();
    gameSocket.disconnect();
    gameSocket = null;
  }

  const token = getToken();
  const user = getCurrentUser();

  if (!user?._id) {
    console.warn('getGameSocket: no user, creating socket without userId');
  }

  gameSocket = io('/game', {
    auth: {
      token,
      userId: user?._id || '',
      displayName: user?.displayName || 'Игрок',
    },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    forceNew: false,
  });

  gameSocket.on('connect', () => {
    console.log('Game socket connected, id:', gameSocket?.id);
  });

  gameSocket.on('connect_error', (err) => {
    console.error('Game socket error:', err.message);
  });

  gameSocket.on('disconnect', (reason) => {
    console.log('Game socket disconnected:', reason);
  });

  return gameSocket;
}

export function getChatSocket(): Socket {
  if (chatSocket?.connected) return chatSocket;

  const token = getToken();
  const user = getCurrentUser();

  chatSocket = io('/chat', {
    auth: {
      token,
      userId: user?._id || '',
      displayName: user?.displayName || 'Игрок',
    },
    reconnection: true,
    reconnectionAttempts: 5,
  });

  return chatSocket;
}

export function disconnectAll(): void {
  socket?.disconnect();
  gameSocket?.disconnect();
  chatSocket?.disconnect();
  socket = null;
  gameSocket = null;
  chatSocket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
