import { useState, useEffect, useCallback } from "react";
import {
  X,
  Copy,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ApiErrorEvent } from "@shared/errors/apiErrorEvent";
import { API_ERROR_EVENT } from "@shared/errors/apiErrorEvent";
import { EXPLICIT_CONTENT_CODE } from "@/lib/moderation/explicit-content-error";
import { useAuth } from "@/lib/auth";
import { isDeveloperViewer } from "@/lib/auth-claims";
import { reportClientError } from "@/lib/error-report";
import {
  diagnosticFromEvent,
  formatDiagnosticReference,
  type LLMDiagnostic,
} from "@/lib/llm-diagnostic";

type ReportStatus = "idle" | "sending" | "sent" | "failed";

interface ToastEntry extends ApiErrorEvent {
  id: string;
  expanded: boolean;
  copied: boolean;
  reportStatus: ReportStatus;
  reportError?: string;
}

const MAX_TOASTS = 5;

/**
 * Global toast stack for API errors.
 *
 * Renders for everyone — but the surface depends on the viewer:
 *   • SuperAdmin / seanhogg: full developer toast with status, code,
 *     URL, request ID, and an expandable details panel containing the
 *     raw payload. Same UX as before.
 *   • Everyone else: a friendly "An error occurred" toast with a
 *     "Report this error" button that POSTs the full payload to
 *     /api/errors/report (which emails it to the maintainer). The
 *     end user never sees the raw stack — just acknowledges + reports.
 */
export default function GlobalErrorHandler() {
  const { user, isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  // Devs always see the developer view (whether or not their JWT
  // currently has the SA role on this device).
  const seesDeveloperView = isDeveloperViewer({ isSuperAdmin, email: user?.email });
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  // ── Listen for API error events ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent<ApiErrorEvent>) => {
      // AI usage-limit hits get the dedicated `<GlobalAIUsageBanner>`
      // upgrade prompt instead of a red error toast. Both components
      // listen to API_ERROR_EVENT so the api-client doesn't have to know
      // which surface owns which code.
      if (e.detail.code === "AI_USAGE_LIMIT_REACHED") return;
      // Explicit-content blocks aren't faults: <GlobalExplicitContentNotice>
      // shows them as a localized notice (no "report this error").
      if (e.detail.code === EXPLICIT_CONTENT_CODE) return;
      const entry: ToastEntry = {
        ...e.detail,
        id: crypto.randomUUID(),
        expanded: false,
        copied: false,
        reportStatus: "idle",
      };
      setToasts((prev) => [entry, ...prev].slice(0, MAX_TOASTS));
    };

    window.addEventListener(
      API_ERROR_EVENT,
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        API_ERROR_EVENT,
        handler as EventListener,
      );
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, expanded: !t.expanded } : t)),
    );
  }, []);

  const copyTicket = useCallback(async (toast: ToastEntry) => {
    // Hoist LLM diagnostic fields to top-level reference lines so the
    // first thing a support reader sees is `correlationId` /
    // `classification` / which model failed last — not buried in a
    // JSON.stringify dump that gets truncated mid-paste.
    const diag = diagnosticFromEvent(toast);
    const lines: (string | null)[] = [
      "## Support Ticket — API Error",
      `**Time:** ${toast.timestamp}`,
      `**URL:** ${toast.method} ${toast.url}`,
      `**Status:** ${toast.status}`,
      toast.code ? `**Code:** ${toast.code}` : null,
      `**Message:** ${toast.message}`,
      toast.requestId ? `**Request ID:** ${toast.requestId}` : null,
      diag ? `**LLM Reference:** ${diag.correlationId}` : null,
      diag ? `**LLM Classification:** ${diag.classification} (${diag.attemptCount} attempt${diag.attemptCount === 1 ? "" : "s"})` : null,
      diag?.lastAttempt
        ? `**LLM Last Attempt:** ${diag.lastAttempt.model} → ${diag.lastAttempt.kind}${diag.lastAttempt.status ? ` ${diag.lastAttempt.status}` : ""}${diag.lastAttempt.requestId ? ` (gateway req ${diag.lastAttempt.requestId})` : ""}`
        : null,
      toast.details != null
        ? `**Details:**\n\`\`\`json\n${JSON.stringify(toast.details, null, 2)}\n\`\`\``
        : null,
      `**User Agent:** ${navigator.userAgent}`,
      `**Page:** ${window.location.href}`,
    ];

    const ticket = lines.filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(ticket);
      setToasts((prev) =>
        prev.map((t) => (t.id === toast.id ? { ...t, copied: true } : t)),
      );
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === toast.id ? { ...t, copied: false } : t)),
        );
      }, 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context)
    }
  }, []);

  const submitReport = useCallback(async (toast: ToastEntry) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === toast.id ? { ...t, reportStatus: "sending", reportError: undefined } : t)),
    );
    const result = await reportClientError({
      source: "api",
      message: `${toast.status}${toast.code ? ` ${toast.code}` : ""}: ${toast.message}`,
      severity: String(toast.status),
      errorId: toast.requestId ?? undefined,
      context: {
        method: toast.method,
        url: toast.url,
        status: toast.status,
        code: toast.code,
        requestId: toast.requestId,
        details: toast.details,
        timestamp: toast.timestamp,
        viewerEmail: user?.email,
      },
    });
    setToasts((prev) =>
      prev.map((t) =>
        t.id === toast.id
          ? {
              ...t,
              reportStatus: result.ok ? "sent" : "failed",
              reportError: result.errorMessage,
            }
          : t,
      ),
    );
    // Auto-dismiss after a successful report so the toast stack stays tidy.
    if (result.ok) {
      setTimeout(() => dismiss(toast.id), 2500);
    }
  }, [dismiss, user?.email]);

  // ── Render nothing when idle ─────────────────────────────────────────
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 z-50 flex flex-col gap-2 sm:w-full sm:max-w-[420px]">
      {toasts.map((toast) => {
        // Extract once per toast so both variants render the same
        // diagnostic without duplicating the lookup. `diag` is null
        // for non-LLM API errors, in which case nothing renders.
        const diag = diagnosticFromEvent(toast);
        return seesDeveloperView ? (
          <DeveloperToast
            key={toast.id}
            toast={toast}
            diag={diag}
            onDismiss={dismiss}
            onToggleExpand={toggleExpand}
            onCopy={copyTicket}
          />
        ) : (
          <UserToast
            key={toast.id}
            toast={toast}
            diag={diag}
            onDismiss={dismiss}
            onReport={submitReport}
            t={t}
          />
        );
      })}
    </div>
  );
}

// ── Developer-facing toast (full details) ─────────────────────────────────────

function DeveloperToast({
  toast,
  diag,
  onDismiss,
  onToggleExpand,
  onCopy,
}: {
  toast: ToastEntry;
  diag: LLMDiagnostic | null;
  onDismiss: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCopy: (toast: ToastEntry) => void;
}) {
  return (
    <div className="bg-card border border-red-200 dark:border-red-800 rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-right-5 fade-in duration-200">
      <div className="flex items-start gap-2 p-3">
        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <span>{toast.status}</span>
            {toast.code && (
              <span className="text-xs font-mono bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded">
                {toast.code}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground font-normal whitespace-nowrap">
              {new Date(toast.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-foreground/80 truncate mt-0.5">
            {toast.message}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {toast.method} {toast.url}
          </p>
          {diag && (
            <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400 truncate mt-0.5">
              {diag.classification} · {diag.attemptCount}× · {diag.correlationId}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleExpand(toast.id)}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title={toast.expanded ? "Collapse" : "Expand details"}
          >
            {toast.expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={() => onCopy(toast)}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title="Copy support ticket"
          >
            {toast.copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {toast.expanded && (
        <div className="border-t border-red-100 dark:border-red-900 px-3 py-2 max-h-48 overflow-y-auto">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono">
            {JSON.stringify(
              {
                status: toast.status,
                code: toast.code,
                message: toast.message,
                method: toast.method,
                url: toast.url,
                requestId: toast.requestId,
                details: toast.details,
                timestamp: toast.timestamp,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── End-user toast (friendly + report button, no stack) ───────────────────────

function UserToast({
  toast,
  diag,
  onDismiss,
  onReport,
  t,
}: {
  toast: ToastEntry;
  diag: LLMDiagnostic | null;
  onDismiss: (id: string) => void;
  onReport: (toast: ToastEntry) => void;
  t: TFunction;
}) {
  const sending = toast.reportStatus === "sending";
  const sent = toast.reportStatus === "sent";
  const failed = toast.reportStatus === "failed";

  return (
    <div className="bg-card border border-red-200 dark:border-red-800 rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-right-5 fade-in duration-200">
      <div className="flex items-start gap-3 p-3">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t("headings.errorOccurred")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sent
              ? t("messages.errorReportSentToast")
              : failed
              ? toast.reportError ?? t("errors.reportSendFailed")
              : t("messages.errorReportPrompt")}
          </p>
          {diag && (
            // Surface the LLM correlationId so a user copying the
            // toast text into a support email carries the trace
            // anchor SA needs to grep logs by. Mono so it visually
            // reads as a quotable reference, not body copy.
            <p className="text-[11px] font-mono text-muted-foreground mt-1 break-all select-all">
              {formatDiagnosticReference(diag)}
            </p>
          )}
          {!sent && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onReport(toast)}
                disabled={sending}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400 transition-colors"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("status.sending")}
                  </>
                ) : failed ? (
                  <>
                    <Send className="h-3 w-3" />
                    {t("actions.tryAgain")}
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    {t("actions.reportError")}
                  </>
                )}
              </button>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-xs text-muted-foreground hover:text-foreground/80 px-2 py-1"
              >
                {t("actions.dismiss")}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors shrink-0"
          title={t("actions.dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
