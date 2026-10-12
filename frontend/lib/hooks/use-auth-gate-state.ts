/**
 * The non-UI core of the "let them try, gate the value-capture" primitive
 * (`useAuthGate` in components/auth): `requireAuth`, the resume-on-auth
 * latch, and the auth sheet's state. `useAuthGate` renders that state as
 * `<AuthGateSheet>`; a lib hook that must not render UI uses this directly
 * and hands `sheet` to its host to render.
 */
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

export interface UseAuthGateOptions {
  /** Post-verify return target handed to the signup flow. */
  redirectTo?: string;
  /** Stamp a deferred claim right before the signup success redirect. */
  onSignupSubmitted?: () => void;
  /** Default headline if a call site doesn't pass its own reason. */
  defaultReason?: string;
  /** Title shown at the top of the panel sheet. */
  title?: string;
}

export interface RequireAuthOptions {
  reason?: string;
  /** The action to resume once the visitor authenticates in place. Pass the
   *  same handler that called requireAuth so it re-runs and passes the gate. */
  onAuthed?: () => void;
}

/** Everything the auth sheet renders from. */
export interface AuthGateSheetState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  reason?: string;
  redirectTo?: string;
  onAuthenticated: () => void;
  onSignupSubmitted?: () => void;
}

export function useAuthGateState(opts: UseAuthGateOptions = {}) {
  const { user, isGuest } = useAuth();
  const hasAccount = !!user && !isGuest;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(opts.defaultReason);
  const pendingActionRef = useRef<(() => void) | null>(null);
  // Latches true the instant the visitor authenticates in the panel, so a
  // resumed action sees "authenticated" even before the auth context's React
  // state has propagated on the next render.
  const authedRef = useRef(false);

  const requireAuth = useCallback(
    (o?: RequireAuthOptions): boolean => {
      if (hasAccount || authedRef.current) return true;
      pendingActionRef.current = o?.onAuthed ?? null;
      setReason(o?.reason ?? opts.defaultReason);
      setOpen(true);
      return false;
    },
    [hasAccount, opts.defaultReason],
  );

  const handleAuthenticated = useCallback(() => {
    authedRef.current = true;
    setOpen(false);
    const fn = pendingActionRef.current;
    pendingActionRef.current = null;
    fn?.();
  }, []);

  const sheet: AuthGateSheetState = {
    open,
    onOpenChange: setOpen,
    title: opts.title,
    reason,
    redirectTo: opts.redirectTo,
    onAuthenticated: handleAuthenticated,
    onSignupSubmitted: opts.onSignupSubmitted,
  };

  return { requireAuth, sheet, isAuthed: hasAccount || authedRef.current };
}
