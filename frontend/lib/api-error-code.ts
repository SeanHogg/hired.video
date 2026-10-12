/** The server's `error.code` on a failed API call (api-client stashes it on
 *  `context.serverCode`), or null for network / non-envelope failures. */
export function apiServerErrorCode(err: unknown): string | null {
  const code = (err as { context?: { serverCode?: unknown } } | null)?.context?.serverCode;
  return typeof code === "string" ? code : null;
}
