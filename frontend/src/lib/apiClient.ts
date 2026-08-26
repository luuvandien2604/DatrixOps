export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface ApiOptions extends RequestInit {
  data?: unknown;
}

type TokenStorage = Storage;
let refreshPromise: Promise<string> | null = null;

const getTokenStorage = (): TokenStorage | null => {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem('refresh_token')) return localStorage;
  if (sessionStorage.getItem('refresh_token')) return sessionStorage;
  return null;
};

const refreshAccessToken = async (): Promise<string> => {
  const storage = getTokenStorage();
  const refreshToken = storage?.getItem('refresh_token');
  if (!storage || !refreshToken) {
    throw new Error('[UNAUTHORIZED] Your session has expired');
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const result = await response.json();
  if (!response.ok || !result.data?.access_token || !result.data?.refresh_token) {
    storage.removeItem('access_token');
    storage.removeItem('refresh_token');
    throw new Error(`[${result.error?.code || 'UNAUTHORIZED'}] ${result.error?.message || 'Your session has expired'}`);
  }

  storage.setItem('access_token', result.data.access_token);
  storage.setItem('refresh_token', result.data.refresh_token);
  return result.data.access_token;
};

const getFreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

export async function apiClient(endpoint: string, options: ApiOptions = {}) {
  const { data, headers: customHeaders, ...customConfig } = options;
  const request = async (token: string | null) => {
    const config: RequestInit = {
      method: data !== undefined ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...customHeaders,
      },
      ...customConfig,
    };
    if (data !== undefined) config.body = JSON.stringify(data);
    return fetch(`${API_BASE_URL}${endpoint}`, config);
  };

  const initialToken = typeof window !== 'undefined'
    ? localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
    : null;
  let response = await request(initialToken);

  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const freshToken = await getFreshAccessToken();
    response = await request(freshToken);
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`[${result.error?.code || 'UNKNOWN'}] ${result.error?.message || 'API request failed'}`);
  }
  return result.data;
}

export function getUserRole(): string {
  if (typeof window === 'undefined') return 'admin';
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  if (!token) return 'admin';
  
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return 'admin';
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    const payload = JSON.parse(json);
    return payload.role || 'admin';
  } catch {
    return 'admin';
  }
}
