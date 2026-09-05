export const AUTH_PROVIDER_TIMEOUT_MS = 4000;
export const APP_AUTH_TIMEOUT_MS = 12000;

export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = AUTH_PROVIDER_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timed out after \d+ms/i.test(error.message);
}
