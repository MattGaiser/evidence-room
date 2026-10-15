import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      response.ok ? 502 : response.status,
      'The server returned an unreadable response. Your text is still here; try again.',
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The operation could not be completed. Try again.',
    );
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      502,
      'The server returned an incomplete or unexpected response. Your text is still here; try again.',
    );
  return parsed.data;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.name === 'TimeoutError'
      ? 'The server took too long to respond. Your text is still here; try again.'
      : error.message
    : 'The operation could not be completed.';
}
