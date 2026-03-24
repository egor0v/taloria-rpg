/**
 * Authentication management
 */
import { api, setToken, getToken } from './api';
import { connectSocket, disconnectAll } from './socket';
import { navigateTo } from './router';

export interface User {
  _id: string;
  email?: string;
  telegramId?: string;
  displayName: string;
  avatarUrl: string;
  walletGold: number;
  walletSilver: number;
  heroSlots: number;
  activeSubscriptionTier: string;
  subscriptionExpiresAt?: string;
  isAdmin: boolean;
  entitlements: string[];
  settings: any;
  lastLoginAt: string;
  createdAt: string;
}

let currentUser: User | null = null;

export function getCurrentUser(): User | null {
  return currentUser;
}

export function setCurrentUser(user: User | null): void {
  currentUser = user;
  window.dispatchEvent(new CustomEvent('auth:userChanged', { detail: user }));
}

export async function autoLogin(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const data = await api.get<{ user: User }>('/api/auth/me');
    setCurrentUser(data.user);
    connectSocket();
    return true;
  } catch {
    setToken(null);
    return false;
  }
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const data = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
  setToken(data.token);
  setCurrentUser(data.user);
  connectSocket();
  return data.user;
}

export async function registerWithEmail(email: string, password: string, displayName: string): Promise<User> {
  const data = await api.post<{ token: string; user: User }>('/api/auth/register', { email, password, displayName });
  setToken(data.token);
  setCurrentUser(data.user);
  connectSocket();
  return data.user;
}

export function logout(): void {
  api.post('/api/auth/logout').catch(() => {});
  setToken(null);
  setCurrentUser(null);
  disconnectAll();
  navigateTo('/');
}

// Listen for forced logout
window.addEventListener('auth:logout', () => {
  setCurrentUser(null);
  disconnectAll();
  navigateTo('/');
});
