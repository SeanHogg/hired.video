import { useEffect, useState } from "react";
import { API_ERROR_EVENT, type ApiErrorEvent } from "@shared/errors/apiErrorEvent";
import { AIUsageLimitErrorBanner } from "@/components/AIUsageLimitBanner";

/**
 * Global upgrade-prompt banner for AI usage-limit hits.
 *
 * Subscribes to the same `API_ERROR_EVENT` window event the api-client
 * dispatches for every API failure, but only renders for the
 * `AI_USAGE_LIMIT_REACHED` code. `<GlobalErrorHandler>` filters that
 * same code out of its red-toast queue, so a usage-limit hit produces
 * exactly one user-facing surface — this inline upgrade CTA — and never
 * a red error toast.
 *
 * Two server paths land here:
 *   • Per-user `TOKEN_BUDGET_EXCEEDED` (the user has used their monthly
 *     token allowance), and
 *   • Vendor `plan_token_limit_exceeded` (our Builderforce gateway
 *     refuses calls because OUR daily plan is exhausted, mapped
 *     server-side in [llm-error.ts] so end users get an upgrade prompt
 *     instead of "AI is at capacity").
 *
 * Lives at the App root next to `<GlobalErrorHandler>` so every page
 * inherits the surface — no per-tool wiring required when a new
 * AI-metered route is added. Renders fixed-position top-center: avoids
 * the bottom-right toast stack AND the bottom-left sidebar where the
 * AITokenPill (which also flips into a "limit reached / upgrade" state
 * on the same event) lives.
 */
export default function GlobalAIUsageBanner() {
  const [state, setState] = useState<{
    message: string;
    used?: number;
    limit?: number;
    upgradeUrl?: string;
  } | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent<ApiErrorEvent>) => {
      if (e.detail.code !== "AI_USAGE_LIMIT_REACHED") return;
      const ctx = (e.detail.details ?? {}) as Record<string, unknown>;
      // The frontend's createErrorFromResponse defaults upgradeUrl to
      // "/pricing" on the AppError, but the dispatched event carries
      // raw error.details — which doesn't include those derived fields.
      // Defaulting here keeps the banner CTA stable when the server
      // omits an explicit url (current backend default).
      const upgradeUrl =
        typeof ctx.upgradeUrl === "string" ? ctx.upgradeUrl : "/pricing";
      const used = typeof ctx.used === "number" ? ctx.used : undefined;
      const limit = typeof ctx.limit === "number" ? ctx.limit : undefined;
      setState({
        message: e.detail.message,
        used,
        limit,
        upgradeUrl,
      });
    };
    window.addEventListener(API_ERROR_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(API_ERROR_EVENT, handler as EventListener);
  }, []);

  if (!state) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-[480px] px-4">
      <AIUsageLimitErrorBanner
        message={state.message}
        used={state.used}
        limit={state.limit}
        upgradeUrl={state.upgradeUrl}
        onDismiss={() => setState(null)}
      />
    </div>
  );
}
