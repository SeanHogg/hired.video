/** Shared response wrapper used by all admin/SA route files. */
export function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

/** Error envelope — the `{ success: false, error }` shape the web client's ApiClient reads. */
export function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}
