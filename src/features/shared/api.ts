
import { request } from '@/services/http';

export async function apiRequest<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  return request<T>(path, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });
}
