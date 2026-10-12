/**
 * Cloudflare Turnstile bot-protection widget. Thin wrapper around
 * `@marsidev/react-turnstile` that adapts the library's API to the
 * project's `TurnstileWidgetHandle` contract (forwarded `reset()`) and
 * applies sensible defaults so consumers don't have to think about
 * lifecycle:
 *
 *   • `appearance: "always"`            — every unauthenticated entry
 *     form (Login / Signup / Forgot Password / Magic Link / Affiliate)
 *     shows a visible challenge box. The visible affordance is the
 *     explicit posture — users can see that they're being verified, the
 *     widget surfaces challenge state on demand, and the same gate runs
 *     against every entry path. OAuth flows (Google / LinkedIn) skip
 *     this widget entirely — they're authenticated by the provider, so
 *     gating them with Turnstile would soft-lock real users whenever
 *     Cloudflare gets twitchy.
 *   • `refreshExpired: "auto"`          — auto-rotates the token before
 *     the 300s expiry so a user who lingered on the form still has a
 *     valid token at submit time.
 *   • `retry: "auto"`                   — auto-retries on Cloudflare
 *     errors so transient hiccups don't soft-lock the form.
 *
 * Renders nothing when `VITE_TURNSTILE_SITE_KEY` is unset (local/dev
 * builds). The backend mirrors this: when `TURNSTILE_SECRET_KEY` is
 * also unset, the captcha port reports `enforced=false` and signup
 * proceeds without a token. When the BACKEND is enforcing but the
 * FRONTEND has no key (config mismatch), gap #1122's soft-signal path
 * kicks in — signup records a bot_block_event and proceeds to the
 * email-verification step instead of hard-failing with TURNSTILE_FAIL.
 *
 * Tokens are one-shot — after ANY signup/login failure response,
 * callers should invoke `reset()` via the forwarded ref so the user
 * gets a fresh challenge on retry. The library's `onExpire` /
 * `onError` callbacks emit `onToken("")` so the parent's submit gate
 * disables until a fresh token arrives.
 */

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import type { TurnstileWidgetHandle } from "@/lib/hooks/use-turnstile";

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  theme?: "light" | "dark" | "auto";
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, theme = "auto" }, ref) {
    const turnstileRef = useRef<TurnstileInstance | null>(null);
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          turnstileRef.current?.reset();
          onToken("");
        },
      }),
      [onToken],
    );

    // No frontend key — consumers gate mount on `useTurnstile().configured`,
    // so this branch is only hit if a consumer forgets the gate. Return
    // null; the parent's `useTurnstile().ready` already reports true when
    // not configured so the form can still submit. Backend either skips
    // verification (no secret) or applies the soft-signal recovery path
    // (#1122) when the secret is set but no token arrives.
    if (!siteKey) return null;

    return (
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        options={{
          theme,
          appearance: "always",
          refreshExpired: "auto",
          retry: "auto",
        }}
        onSuccess={onToken}
        onExpire={() => {
          onToken("");
          turnstileRef.current?.reset();
        }}
        onError={() => {
          onToken("");
          // Don't auto-reset on error — `retry: "auto"` already handles
          // the recoverable cases; resetting again would cancel that.
        }}
      />
    );
  },
);
