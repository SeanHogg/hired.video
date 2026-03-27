/** Shared response wrapper used by all admin/SA route files. */
export function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
