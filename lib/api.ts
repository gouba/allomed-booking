export async function corePublic<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`/api/core${normalizedPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message || `Core public request failed (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
