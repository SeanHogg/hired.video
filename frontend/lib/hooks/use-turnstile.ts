/**
 * Single source of truth for the Cloudflare Turnstile state machine on
 * signup-style forms. Owns the token, the ref, the readiness predicate,
 * and the post-failure reset — so each form only renders `<TurnstileWidget>`
 * and consumes `{ token, ready, configured, ref, onToken, reset }`.
 *
 * DRY anchor: Signup.tsx and AffiliateProgram.tsx both need the same
 * widget mount + button-disable gate + on-error reset. Anything beyond a
 * trivial difference (e.g. theme) should be plumbed through this hook
 * rather than re-implemented per form.
 */

import { useCallback, useRef, useState } from "react";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";

export interface UseTurnstileResult {
  /** Site key flag — only when this is true should the form render the
   *  `<TurnstileWidget>`. When false the backend skips captcha verification
   *  too, so the form can submit without one. */
  configured: boolean;
  /** True when the form is allowed to submit. Mirrors the legacy
   *  `captchaReady` derivation: not configured ⇒ always ready, otherwise
   *  ready iff a non-empty token has arrived from the widget. */
  ready: boolean;
  /** Token to send to the backend. `undefined` when no site key is set or
   *  no fresh token has been issued yet. */
  token: string | undefined;
  /** Ref to attach to `<TurnstileWidget ref={...} />`. */
  ref: React.RefObject<TurnstileWidgetHandle | null>;
  /** onToken handler to pass to `<TurnstileWidget>`. Stable across renders. */
  onToken: (token: string) => void;
  /** Reset the widget after a server-side signup failure. The widget is
   *  one-shot, so any submission that reached the captcha gate (or beyond)
   *  spent the token; the next retry would otherwise hit
   *  `timeout-or-duplicate` and re-fail with TURNSTILE_FAIL. Calling this
   *  fires `onToken("")` internally, so the parent's `ready` flips to
   *  false until the user solves the new challenge. */
  reset(): void;
}

export function useTurnstile(): UseTurnstileResult {
  const configured = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  const [token, setToken] = useState<string | null>(null);
  const ref = useRef<TurnstileWidgetHandle>(null);
  const onToken = useCallback((t: string) => setToken(t), []);
  const reset = useCallback(() => ref.current?.reset(), []);
  const ready = !configured || (token !== null && token !== "");
  return {
    configured,
    ready,
    token: token === null || token === "" ? undefined : token,
    ref,
    onToken,
    reset,
  };
}
