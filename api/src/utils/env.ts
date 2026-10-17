/**
 * Read a Worker binding / env var by name — `process.env` (Node, tests,
 * nodejs_compat) first, then the request-scoped `__ENV` the Worker entry
 * installs. Empty string when unset. The one implementation; modules import
 * it instead of re-declaring a private copy.
 */
export function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

/**
 * The Worker bindings record off a Hono context (`c.env`) as a plain
 * string map — what `buildApiDeps(env)` and the tax-id envelope expect.
 * Empty object when the context carries no env (Node tests). Distinct from
 * `getEnv(key)`, which reads ONE value from the process/global env.
 */
export function requestEnv(c: unknown): Record<string, string | undefined> {
  return ((c as { env?: Record<string, string | undefined> } | null | undefined)?.env ?? {}) as Record<
    string,
    string | undefined
  >;
}
