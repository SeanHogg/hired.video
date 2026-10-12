/**
 * The short name a job goes by in the UI ("CIO · Macomb") — the first line
 * of its post, clipped. Shared by the kit review label, the job-match
 * panel title and the tool runs that record which job they were for (#2344).
 */
export function jobLabel(text: string, fallback: string): string {
  const first = text.trim().split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  return (first.length > 80 ? `${first.slice(0, 77)}…` : first) || fallback;
}
