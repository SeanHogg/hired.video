/**
 * Client-gone / `AbortSignal.abort()` — distinct from a model failure.
 * Workers, Node, and browsers all name this `AbortError` (`Error` or `DOMException`).
 * Pipeline catch-alls must rethrow it so a closed tab does not look like
 * "the model failed" and kick off more AI calls.
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
