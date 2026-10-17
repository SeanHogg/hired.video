import type { Context } from "hono";

/** JSON body or `{}` when absent/malformed (matches the pre-split behaviour). */
export function readJsonBody(c: Context): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}
