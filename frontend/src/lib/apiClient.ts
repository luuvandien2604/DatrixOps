export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

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
    throw new Error(result.error?.message || 'API request failed');
  }

  return result.data;
}
