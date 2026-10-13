/**
 * Diagnostics sections — state a long-running flow reports about ITSELF into
 * every diagnostics report (DiagnosticsCopyButton → diagnostics-report.ts),
 * whatever page hosts it. The flow registers while it is mounted
 * (`useDiagnosticsSection`), so no page has to thread it into its own
 * snapshot: the Post run says where it is on the kit dock and in the editor's
 * panel alike.
 *
 * Read at report time, through the latest `read`; a section that throws
 * reports the error instead of breaking the report.
 */
import { useEffect, useRef } from "react";

const sections = new Map<string, () => unknown>();

export function useDiagnosticsSection(name: string, read: () => unknown): void {
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    const reader = () => latest.current();
    sections.set(name, reader);
    return () => {
      if (sections.get(name) === reader) sections.delete(name);
    };
  }, [name]);
}

/** Every registered section's current state (empty object when none). */
export function readDiagnosticsSections(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, read] of sections) {
    try {
      out[name] = read();
    } catch (err) {
      out[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return out;
}
