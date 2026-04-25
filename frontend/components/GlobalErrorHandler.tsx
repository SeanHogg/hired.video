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
import type { ApiErrorEvent } from "@shared/errors/apiErrorEvent";
import { API_ERROR_EVENT } from "@shared/errors/apiErrorEvent";
import { useAuth } from "@/lib/auth";
import { reportClientError } from "@/lib/error-report";

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
 *     /api/errors/report (which fans out to email + New Relic). The
 *     end user never sees the raw stack — just acknowledges + reports.
 */
export default function GlobalErrorHandler() {
  const { user, isSuperAdmin } = useAuth();
  // Devs always see the developer view (whether or not their JWT
  // currently has the SA role on this device).
  const seesDeveloperView = isSuperAdmin || user?.email === "seanhogg@gmail.com";
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  // ── Listen for API error events ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent<ApiErrorEvent>) => {
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
    const lines: (string | null)[] = [
      "## Support Ticket — API Error",
      `**Time:** ${toast.timestamp}`,
      `**URL:** ${toast.method} ${toast.url}`,
      `**Status:** ${toast.status}`,
      toast.code ? `**Code:** ${toast.code}` : null,
      `**Message:** ${toast.message}`,
      toast.requestId ? `**Request ID:** ${toast.requestId}` : null,
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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-[420px]">
      {toasts.map((toast) =>
        seesDeveloperView ? (
          <DeveloperToast
            key={toast.id}
            toast={toast}
            onDismiss={dismiss}
            onToggleExpand={toggleExpand}
            onCopy={copyTicket}
          />
        ) : (
          <UserToast
            key={toast.id}
            toast={toast}
            onDismiss={dismiss}
            onReport={submitReport}
          />
        ),
      )}
    </div>
  );
}

// ── Developer-facing toast (full details) ─────────────────────────────────────

function DeveloperToast({
  toast,
  onDismiss,
  onToggleExpand,
  onCopy,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCopy: (toast: ToastEntry) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-right-5 fade-in duration-200">
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
            <span className="ml-auto text-xs text-gray-400 font-normal whitespace-nowrap">
              {new Date(toast.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 truncate mt-0.5">
            {toast.message}
          </p>
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {toast.method} {toast.url}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleExpand(toast.id)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
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
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
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
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {toast.expanded && (
        <div className="border-t border-red-100 dark:border-red-900 px-3 py-2 max-h-48 overflow-y-auto">
          <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all font-mono">
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
  onDismiss,
  onReport,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
  onReport: (toast: ToastEntry) => void;
}) {
  const sending = toast.reportStatus === "sending";
  const sent = toast.reportStatus === "sent";
  const failed = toast.reportStatus === "failed";

  return (
    <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-right-5 fade-in duration-200">
      <div className="flex items-start gap-3 p-3">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            An error has occurred
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {sent
              ? "Report sent — thanks. The team will take a look."
              : failed
              ? toast.reportError ?? "We couldn't send the report. Please try again."
              : "Something went wrong on our end. You can send the technical details to the team to help them fix it."}
          </p>
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
                    Sending…
                  </>
                ) : failed ? (
                  <>
                    <Send className="h-3 w-3" />
                    Try again
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    Report this error
                  </>
                )}
              </button>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
