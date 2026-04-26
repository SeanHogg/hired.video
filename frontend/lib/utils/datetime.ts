// Small datetime helpers shared across recruiter surfaces. The codebase has
// `useUserTimezone` for full TZ-aware formatting; these are plain helpers
// for the few places that just need "N days ago".

export function daysSince(iso: string | Date): string {
  const ts = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const ms = Date.now() - ts;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
