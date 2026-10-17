/**
 * The studio `{ success, data|error, timestamp }` response envelope. Lives
 * below the routes because the public watch cache stores whole envelopes
 * (services/studio/public-watch-payload.ts); routes/studio/http.ts
 * re-exports it for the sub-routers.
 */
export function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

export function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}
