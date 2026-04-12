import { useState, useEffect, useCallback } from "react";
import {
  X,
  Copy,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ApiErrorEvent } from "@shared/errors/apiErrorEvent";
import { API_ERROR_EVENT } from "@shared/errors/apiErrorEvent";

interface ToastEntry extends ApiErrorEvent {
  id: string;
  expanded: boolean;
  copied: boolean;
}

const MAX_TOASTS = 5;

/**
 * Global toast stack for API errors.
 *
 * Listens for `hired:api-error` CustomEvents dispatched by the API client
 * and renders a dismissable, expandable toast for each one.
 * Renders nothing until an error event fires — safe to mount unconditionally.
 */
export default function GlobalErrorHandler() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  // ── Listen for API error events ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent<ApiErrorEvent>) => {
      const entry: ToastEntry = {
        ...e.detail,
        id: crypto.randomUUID(),
        expanded: false,
        copied: false,
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

  // ── Render nothing when idle ─────────────────────────────────────────
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-[420px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-right-5 fade-in duration-200"
        >
          {/* ── Header row ─────────────────────────────────────── */}
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

            {/* ── Action buttons ───────────────────────────────── */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleExpand(toast.id)}
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
                onClick={() => copyTicket(toast)}
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
                onClick={() => dismiss(toast.id)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Expanded details ───────────────────────────────── */}
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
      ))}
    </div>
  );
}
