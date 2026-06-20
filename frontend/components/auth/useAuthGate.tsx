/**
 * useAuthGate — reusable "let them try, gate the value-capture" primitive.
 *
 * Any surface that wants to let an UNAUTHENTICATED visitor do work but require
 * an account before a specific action (Save / Publish / Export …) calls
 * `requireAuth()` at the top of that action's handler and renders `gate`
 * somewhere in its tree:
 *
 *   const { requireAuth, gate } = useAuthGate({ redirectTo, onSignupSubmitted });
 *   async function handleSave() {
 *     if (!requireAuth({ reason, onAuthed: () => void handleSave() })) return;
 *     …actually save…
 *   }
 *   return <>{editor}{gate}</>;
 *
 * When the visitor is already authenticated `requireAuth` returns true and the
 * handler proceeds inline. When not, it opens the in-place auth panel and
 * returns false; once they sign in we re-run the SAME handler (`onAuthed`),
 * which now passes the gate and completes. The `authedRef` latch makes that
 * re-run safe in the same tick, before the auth context has re-rendered.
 *
 * The signup branch can't resume inline (email-verify happens first, no session
 * yet) — `onSignupSubmitted` lets the host stamp a deferred-claim record and
 * `redirectTo` brings the visitor back to finish it.
 */
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import AuthGatePanel from "@/components/auth/AuthGatePanel";

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

export function useAuthGate(opts: UseAuthGateOptions = {}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(opts.defaultReason);
  const pendingActionRef = useRef<(() => void) | null>(null);
  // Latches true the instant the visitor authenticates in the panel, so a
  // resumed action sees "authenticated" even before the auth context's React
  // state has propagated on the next render.
  const authedRef = useRef(false);

  const requireAuth = useCallback(
    (o?: RequireAuthOptions): boolean => {
      if (user || authedRef.current) return true;
      pendingActionRef.current = o?.onAuthed ?? null;
      setReason(o?.reason ?? opts.defaultReason);
      setOpen(true);
      return false;
    },
    [user, opts.defaultReason],
  );

  const handleAuthenticated = useCallback(() => {
    authedRef.current = true;
    setOpen(false);
    const fn = pendingActionRef.current;
    pendingActionRef.current = null;
    fn?.();
  }, []);

  const gate = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>{opts.title}</SheetTitle>
        </SheetHeader>
        <AuthGatePanel
          reason={reason}
          redirectTo={opts.redirectTo}
          onAuthenticated={handleAuthenticated}
          onSignupSubmitted={opts.onSignupSubmitted}
        />
      </SheetContent>
    </Sheet>
  );

  return { requireAuth, gate, isAuthed: !!user || authedRef.current };
}
