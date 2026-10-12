/** Tiny helpers shared by the /api/advertising sub-routers. */

/** Authenticated user id (the mount is behind auth middleware). */
export function uid(c: { var: object }): string {
  return (c.var as { user?: { sub?: string } }).user?.sub as string;
}

export function ok<T>(data: T) {
  return { success: true as const, data };
}
