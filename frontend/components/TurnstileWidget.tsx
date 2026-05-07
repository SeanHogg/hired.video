import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile bot-protection widget. Renders only when
// VITE_TURNSTILE_SITE_KEY is configured — otherwise emits an empty token
// immediately so local/dev forms can still submit. The backend mirrors
// this: it skips verification when TURNSTILE_SECRET_KEY is unset.
//
// Tokens are one-shot: once verified server-side they cannot be replayed.
// After ANY signup failure response, callers should invoke `reset()` via
// the forwarded ref so the user gets a fresh challenge to retry with —
// otherwise every retry hits Cloudflare's `timeout-or-duplicate` and
// surfaces as a TURNSTILE_FAIL even when the original failure was on a
// later gate (e.g. BREACHED_PASSWORD, CONFLICT) that already consumed
// the token.

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (document.getElementById(SCRIPT_ID)) {
    return new Promise((resolve) => {
      const check = () => (window.turnstile ? resolve() : setTimeout(check, 50));
      check();
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
}

export interface TurnstileWidgetHandle {
  /** Discards the current token and re-issues a Turnstile challenge.
   *  No-op when no site key is configured. Fires `onToken("")` so the
   *  parent's captcha-ready state immediately reflects the pending
   *  challenge. */
  reset(): void;
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  theme?: "light" | "dark" | "auto";
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, theme = "auto" }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          if (widgetIdRef.current && window.turnstile) {
            try {
              window.turnstile.reset(widgetIdRef.current);
            } catch {
              // ignore — widget may have been removed mid-reset
            }
          }
          // Clear the parent's token state so the submit button disables
          // until the user solves the new challenge.
          onToken("");
        },
      }),
      [onToken],
    );

    useEffect(() => {
      // No site key configured — emit a sentinel empty token so the form
      // can submit. The backend will skip captcha verification in this case.
      if (!siteKey) {
        onToken("");
        return;
      }
      let cancelled = false;
      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            callback: (token) => onToken(token),
            "expired-callback": () => onToken(""),
            "error-callback": () => onToken(""),
          });
        })
        .catch((err) => {
          console.error("[Turnstile] script load failed:", err);
          // Fail open on script load errors — better than soft-locking the
          // signup form. Backend will still reject if it has a secret set.
          onToken("");
        });
      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore
          }
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, theme, onToken]);

    if (!siteKey) return null;
    return <div ref={containerRef} className="cf-turnstile" />;
  },
);
