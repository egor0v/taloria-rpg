/**
 * API client with JWT interceptor and error handling
 */

let authToken: string | null = localStorage.getItem('taloria_token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('taloria_token', token);
  } else {
    localStorage.removeItem('taloria_token');
  }
}

export function getToken(): string | null {
  return authToken;
}

export interface ApiError {
  error: string;
  details?: any[];
  status: number;
}

export async function apiCall<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 - try refresh
  if (response.status === 401 && url !== '/api/auth/refresh' && url !== '/api/auth/login') {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${authToken}`;
      const retryResponse = await fetch(url, { ...options, headers, credentials: 'include' });
      if (retryResponse.ok) {
        return retryResponse.json();
      }
    }
    // Failed to refresh - logout
    setToken(null);
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw { error: 'Сессия истекла', status: 401 } as ApiError;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw {
      error: data.error || `HTTP ${response.status}`,
      details: data.details,
      status: response.status,
    } as ApiError;
  }

  return response.json();
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const resp = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (resp.ok) {
      const data = await resp.json();
      setToken(data.token);
      return true;
    }
  } catch {}
  return false;
}

// Convenience methods
export const api = {
  get: <T = any>(url: string) => apiCall<T>(url),
  post: <T = any>(url: string, body?: any) =>
    apiCall<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(url: string, body?: any) =>
    apiCall<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(url: string, body?: any) =>
    apiCall<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(url: string) => apiCall<T>(url, { method: 'DELETE' }),
};
