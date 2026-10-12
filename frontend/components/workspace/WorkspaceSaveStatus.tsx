/**
 * WorkspaceSaveStatus — the workspace header's ONE save status, the same on
 * a career kit (its résumé row, useDraftAutosave) and a studio format (its
 * project, useServerAutosave): quiet mono "Saving…" / "Saved" /
 * "Not saved" / "Newer copy elsewhere". Nothing until the first save, so an
 * untouched draft stays uncluttered. Both savers go through
 * useServerAutosave, which retries a failure in the background; "Not saved"
 * says so plainly until it lands.
 */
import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/lib/workspace/save-status";

const STATES: Record<Exclude<SaveStatus, "idle">, { icon: typeof Loader2; labelKey: string; className: string }> = {
  saving: { icon: Loader2, labelKey: "build.save.saving", className: "text-muted-foreground" },
  saved: { icon: Check, labelKey: "build.save.saved", className: "text-muted-foreground" },
  error: { icon: CloudOff, labelKey: "build.save.error", className: "font-medium text-destructive" },
  conflict: { icon: AlertTriangle, labelKey: "autosave.status.conflict", className: "font-medium text-destructive" },
};

export default function WorkspaceSaveStatus({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();
  if (status === "idle") return null;
  const { icon: Icon, labelKey, className } = STATES[status];
  const label = t(labelKey);
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1 font-mono text-[11px]", className)}
      role="status"
      aria-live="polite"
      title={label}
    >
      {/* "Saved" is plain text; only in-flight and failed states carry an icon. */}
      {status !== "saved" && (
        <Icon className={cn("h-3 w-3", status === "saving" && "animate-spin")} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
