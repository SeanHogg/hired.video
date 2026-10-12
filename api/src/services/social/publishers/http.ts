/**
 * Shared HTTP plumbing for the social publisher adapters: JSON calls that map
 * a non-2xx response onto a typed SocialPublishError, and a bounded poll for
 * platforms that process uploads asynchronously.
 */
import { SocialPublishError } from "./types.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 401/403 → NOT_AUTHORIZED; anything else non-2xx → PLATFORM_ERROR. */
export async function readJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    const kind = res.status === 401 || res.status === 403 ? "NOT_AUTHORIZED" : "PLATFORM_ERROR";
    throw new SocialPublishError(kind, `${label} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new SocialPublishError("PLATFORM_ERROR", `${label} returned invalid JSON`);
  }
}

export function bearer(accessToken: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, ...extra };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll `check` until it returns a value (done) or `null` keeps coming back
 * past `timeoutMs`. `check` throws to fail fast.
 */
export async function pollUntil<T>(
  check: () => Promise<T | null>,
  { intervalMs, timeoutMs }: { intervalMs: number; timeoutMs: number },
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== null) return result;
    if (Date.now() + intervalMs > deadline) return null;
    await wait(intervalMs);
  }
}

/** Trim to `max` UTF-16 units without splitting a surrogate pair. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}
