
const BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

console.log('[StableBus] Backend URL:', BASE_URL);

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  console.log(`[StableBus API] ${options.method || 'GET'} ${url}`);

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    console.error('[StableBus API] Network error:', error);
    throw new Error(
      `Cannot reach ${BASE_URL}. Check FastAPI and CORS configuration.`
    );
  }

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
