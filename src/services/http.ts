
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from '../features/auth/tokenStorage';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

console.log('[StableBus] Backend URL:', BASE_URL);

type TokenResponse = {
  access_token: string;
  refresh_token: string;
};

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        await clearTokens();
        return null;
      }

      const response = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        await clearTokens();
        return null;
      }

      const data = (await response.json()) as TokenResponse;

      if (!data.access_token || !data.refresh_token) {
        await clearTokens();
        return null;
      }

      await saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      return data.access_token;
    } catch (error) {
      console.error('[StableBus API] Token refresh failed:', error);
      await clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function isAuthEndpoint(path: string): boolean {
  return path.includes('/api/v1/auth/');
}

async function executeRequest(
  url: string,
  options: RequestInit,
  accessToken?: string | null
): Promise<Response> {
  const headers = new Headers(options.headers);

  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

async function parseResponse<T>(
  response: Response,
  path: string
): Promise<T> {
  const responseText = await response.text();

  let data: any;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(`Invalid JSON response from ${path}`);
  }

  if (!response.ok) {
    const detail =
      data?.detail || data?.message || `HTTP ${response.status}`;

    throw new Error(
      typeof detail === 'string' ? detail : JSON.stringify(detail)
    );
  }

  return data as T;
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  console.log(`[StableBus API] ${options.method || 'GET'} ${url}`);

  try {
    let accessToken = await getAccessToken();

    let response = await executeRequest(
      url,
      options,
      accessToken
    );

    if (
      response.status === 401 &&
      accessToken &&
      !isAuthEndpoint(path)
    ) {
      const newAccessToken = await refreshAccessToken();

      if (newAccessToken) {
        response = await executeRequest(
          url,
          options,
          newAccessToken
        );
      }
    }

    return await parseResponse<T>(response, path);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Cannot reach')
    ) {
      throw error;
    }

    if (error instanceof TypeError) {
      console.error('[StableBus API] Network error:', error);
      throw new Error(
        `Cannot reach ${BASE_URL}. Check FastAPI and CORS configuration.`
      );
    }

    throw error;
  }
}
