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
 *
 * A silent GUEST session (useAuth().isGuest) does not pass this gate: the
 * gate guards actions that need a real account (download, and the visitor's
 * own choice to save their work to an account) — never posting. The guest's work is claimed by the real account on
 * sign-in (AuthProvider → authService.adoptGuest).
 *
 * The non-UI core (requireAuth + the sheet's state) is `useAuthGateState`
 * (lib/hooks/use-auth-gate-state); this renders it as `<AuthGateSheet>`.
 */
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import AuthGatePanel from "@/components/auth/AuthGatePanel";
import {
  useAuthGateState,
  type AuthGateSheetState,
  type UseAuthGateOptions,
} from "@/lib/hooks/use-auth-gate-state";

/** The in-place Sign in / Create account sheet a gated action opens. */
export function AuthGateSheet({
  open,
  onOpenChange,
  title,
  reason,
  redirectTo,
  onAuthenticated,
  onSignupSubmitted,
}: AuthGateSheetState) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader className="mb-5 text-left">
          <SheetTitle className="font-display text-[28px] font-bold leading-[1.05] tracking-[-0.03em]">
            {title}
          </SheetTitle>
        </SheetHeader>
        <AuthGatePanel
          reason={reason}
          redirectTo={redirectTo}
          onAuthenticated={onAuthenticated}
          onSignupSubmitted={onSignupSubmitted}
        />
      </SheetContent>
    </Sheet>
  );
}

export function useAuthGate(opts: UseAuthGateOptions = {}) {
  const { requireAuth, sheet, isAuthed } = useAuthGateState(opts);
  const gate = <AuthGateSheet {...sheet} />;
  return { requireAuth, gate, isAuthed };
}
