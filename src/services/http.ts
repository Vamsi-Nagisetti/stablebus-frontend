import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from '../features/auth/tokenStorage';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://api.stablebus.com'
).replace(/\/+$/, '');

console.log('[StableBus] Backend URL:', BASE_URL);

type TokenResponse = {
  access_token: string;
  refresh_token: string;
};

/** Same as RequestInit, plus an optional per-call timeout (default 15 s). */
/** `timeoutMs`: per-call timeout (default 30 s). `retry`: total attempts when the connection is interrupted (default 2 for GET, 1 otherwise). */
export type RequestOptions = RequestInit & { timeoutMs?: number; retry?: number };

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Errors still behave like normal Errors (same message as before), but now also carry:
 *  - status:    HTTP status code (409, 401, ...) when the server answered
 *  - body:      the parsed JSON body, if any
 *  - isTimeout: true when the request was aborted by OUR timeout
 *  - isCancelled: true when the connection was cancelled/interrupted by the system (app paused, network change, ...)
 */
function makeError(
  message: string,
  extra: { status?: number; body?: any; isTimeout?: boolean; isCancelled?: boolean } = {}
): Error {
  const error = new Error(message) as Error & {
    status?: number;
    body?: any;
    isTimeout?: boolean;
    isCancelled?: boolean;
  };
  error.status = extra.status;
  error.body = extra.body;
  error.isTimeout = extra.isTimeout;
  error.isCancelled = extra.isCancelled;
  return error;
}

let refreshPromise: Promise<string | null> | null = null;

/** Reads the "exp" (expiry, in seconds) from a JWT without any library. Returns null if it can't be read. */
function tokenExpiry(token: string | null | undefined): number | null {
  try {
    if (!token) return null;
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0;
    let value = 0;
    let out = '';
    for (const c of b64) {
      const index = chars.indexOf(c);
      if (index < 0) continue; // padding
      value = (value << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((value >> bits) & 0xff);
      }
    }
    const exp = JSON.parse(out)?.exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token is already expired, or will be within the next 30 seconds. */
function isExpiringSoon(token: string | null | undefined): boolean {
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 - Date.now() < 30000;
}

/**
 * Gets a new access token. The saved login is cleared ONLY when the server clearly says the refresh token
 * is no longer valid (400/401/403). A network hiccup or a server error keeps the login so the next try works.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        return null;
      }

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (response.ok) {
            const data = (await response.json()) as TokenResponse;

            if (data.access_token && data.refresh_token) {
              await saveTokens({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
              });
              return data.access_token;
            }
            return null;
          }

          if ([400, 401, 403].includes(response.status)) {
            // The refresh token itself is expired or already used: the user has to log in again.
            await clearTokens();
            return null;
          }

          console.warn('[StableBus API] Token refresh failed with status', response.status);
        } catch (error) {
          console.warn('[StableBus API] Token refresh interrupted:', error);
        }

        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
      }

      return null; // could not refresh right now; the saved login is kept
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
  accessToken: string | null | undefined,
  timeoutMs: number
): Promise<Response> {
  const headers = new Headers(options.headers);

  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  headers.set('ngrok-skip-browser-warning', 'true');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const controller = new AbortController();

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    console.log(`[StableBus API] Request timed out after ${timeoutMs / 1000} seconds`);
    controller.abort();
  }, timeoutMs);

  console.log('[StableBus API] Fetch started:', url);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    console.log('[StableBus API] Fetch response:', response.status);

    return response;
  } catch (error: any) {
    // warn, not error: a failed request is handled by the caller and must not open the red error screen
    console.warn('[StableBus API] Fetch failed:', error?.message || error);

    // Expo's fetch reports an abort as "Fetch request has been canceled", the browser one as AbortError.
    const interrupted =
      error?.name === 'AbortError' || /abort|cancel/i.test(String(error?.message));

    if (timedOut) {
      throw makeError('The server is taking longer than usual. Please try again.', {
        isTimeout: true,
      });
    }

    if (interrupted) {
      throw makeError('The connection was interrupted. Please try again.', {
        isCancelled: true,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
    throw makeError(`Invalid JSON response from ${path}`, { status: response.status });
  }

  if (!response.ok) {
    const detail =
      data?.detail || data?.message || `HTTP ${response.status}`;

    throw makeError(
      typeof detail === 'string' ? detail : JSON.stringify(detail),
      { status: response.status, body: data }
    );
  }

  return data as T;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase();
  const attempts = Math.max(1, options.retry ?? (method === 'GET' ? 2 : 1));

  for (let attempt = 1; ; attempt++) {
    try {
      return await requestOnce<T>(path, options);
    } catch (error: any) {
      // Only a system-cancelled connection is retried; our own timeout and server answers are not.
      if (error?.isCancelled && attempt < attempts) {
        console.log(`[StableBus API] Retrying after an interrupted connection (${attempt}/${attempts - 1})`);
        await new Promise(resolve => setTimeout(resolve, 600 * attempt));
        continue;
      }
      throw error;
    }
  }
}

async function requestOnce<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retry: _retry, ...init } = options;

  console.log(
    `[StableBus API] ${init.method || 'GET'} ${url}`
  );

  try {
    console.log('[StableBus API] Reading access token...');

    let accessToken = await getAccessToken();

    // Renew in advance, so the request never goes out with a token that is about to expire.
    if (accessToken && !isAuthEndpoint(path) && isExpiringSoon(accessToken)) {
      const fresh = await refreshAccessToken();
      if (fresh) accessToken = fresh;
    }

    console.log(
      '[StableBus API] Access token read:',
      !!accessToken
    );

    console.log('[StableBus API] About to execute fetch');

    let response = await executeRequest(
      url,
      init,
      accessToken,
      timeoutMs
    );

    let looksExpired = response.status === 401;
    if (!looksExpired && response.status === 403 && accessToken) {
      // Some servers answer 403 for an expired token.
      try {
        const text = await response.clone().text();
        looksExpired = /expired|invalid.*token|token.*invalid/i.test(text);
      } catch {
        looksExpired = false;
      }
    }

    if (looksExpired && accessToken && !isAuthEndpoint(path)) {
      const newAccessToken = await refreshAccessToken();

      if (newAccessToken) {
        response = await executeRequest(
          url,
          init,
          newAccessToken,
          timeoutMs
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
      console.warn('[StableBus API] Network error:', error);

      throw makeError(
        `Cannot reach ${BASE_URL}. Check FastAPI and CORS configuration.`
      );
    }

    throw error;
  }
}