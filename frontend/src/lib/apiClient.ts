export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface ApiOptions extends RequestInit {
  data?: any;
}

export async function apiClient(endpoint: string, options: ApiOptions = {}) {
  const { data, headers: customHeaders, ...customConfig } = options;

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const config: RequestInit = {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    },
    ...customConfig,
  };

  if (data) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const result = await response.json();

  if (!response.ok) {
    const errorMsg = result.error?.message || 'API request failed';
    const errorCode = result.error?.code || 'UNKNOWN';
    throw new Error(`[${errorCode}] ${errorMsg}`);
  }

  return result.data;
}
