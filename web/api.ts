export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof body.error === 'string'
        ? body.error
        : 'The operation could not be completed. Try again.',
    );
  return body as T;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.name === 'TimeoutError'
      ? 'The server took too long to respond. Your text is still here; try again.'
      : error.message
    : 'The operation could not be completed.';
}
