/**
 * "Copy diagnostics" — developer-only (SuperAdmin or the lead developer,
 * isDeveloperViewer). One click copies a full report of this page's run to
 * the clipboard (buildDiagnosticsReport: viewer, build, client, the page's
 * state snapshot, recent API requests). Renders nothing for anyone else, so
 * any page can drop it in with just a `collect` function.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bug, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isDeveloperViewer } from "@/lib/auth-claims";
import { buildDiagnosticsReport } from "@/lib/diagnostics/diagnostics-report";

interface DiagnosticsCopyButtonProps {
  /** Names the page in the report, e.g. "/studio/new". */
  page: string;
  /** The page's state at the moment of the click. */
  collect: () => unknown;
}

type CopyState = "idle" | "copied" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / denied permission: the select-and-copy fallback.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export default function DiagnosticsCopyButton({ page, collect }: DiagnosticsCopyButtonProps) {
  const { t } = useTranslation();
  const { user, isSuperAdmin } = useAuth();
  const [state, setState] = useState<CopyState>("idle");
  if (!isDeveloperViewer({ isSuperAdmin, email: user?.email })) return null;

  const copy = async () => {
    const report = buildDiagnosticsReport(page, { id: user?.id, email: user?.email, role: user?.role }, collect());
    setState((await copyText(report)) ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2000);
  };

  const label =
    state === "copied" ? t("diagnostics.copied") : state === "failed" ? t("diagnostics.copyFailed") : t("diagnostics.copy");
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-amber-500/60 bg-card px-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300 sm:min-h-10"
    >
      {state === "copied" ? <Check aria-hidden="true" className="h-4 w-4" /> : <Bug aria-hidden="true" className="h-4 w-4" />}
      <span className="hidden lg:inline" aria-live="polite">
        {label}
      </span>
    </button>
  );
}
