/**
 * Read a Worker binding / env var by name — `process.env` (Node, tests,
 * nodejs_compat) first, then the request-scoped `__ENV` the Worker entry
 * installs. Empty string when unset. The one implementation; modules import
 * it instead of re-declaring a private copy.
 */
export function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}
