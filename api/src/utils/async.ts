/**
 * Small async primitives for fan-out model calls.
 */

/**
 * Map `items` through `fn` with at most `limit` calls in flight, preserving
 * input order in the output. Use it for provider fan-out (OCR pages, section
 * prompts) so a 10-page scan neither runs serially nor fires 10 vendor
 * calls at once.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return out;
}

/**
 * Resolve to the promise's value, or `null` when it rejects or `ms` elapses
 * first. For OPTIONAL work (refinement passes) that must never hold up the
 * main result. The underlying promise keeps running; its late value is
 * discarded because the caller only applies what this returns.
 */
export async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise.catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
