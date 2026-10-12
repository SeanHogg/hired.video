/**
 * The non-UI core of the in-place "this is a Pro feature" prompt
 * (`useProGate` in components/billing): `requirePro` and the Pro sheet's
 * state. `useProGate` renders that state as `<ProGateSheet>`; a lib hook that
 * must not render UI uses this directly and hands `sheet` to its host to
 * render. Mirrors `useAuthGateState` (lib/hooks/use-auth-gate-state).
 *
 * Client-side only — the paid API routes still enforce Pro themselves.
 */
import { useCallback, useState } from "react";
import { useSubscription } from "@/lib/hooks/useSubscription";

/** Everything the Pro sheet renders from. Open while `reason` is set. */
export interface ProGateSheetState {
  reason: string | null;
  onClose: () => void;
}

export function useProGateState() {
  const { isPro, loading } = useSubscription();
  const [reason, setReason] = useState<string | null>(null);

  const requirePro = useCallback(
    (why: string): boolean => {
      // Still loading the plan: let it through — the API gates paid calls.
      if (isPro || loading) return true;
      setReason(why);
      return false;
    },
    [isPro, loading],
  );

  const sheet: ProGateSheetState = { reason, onClose: () => setReason(null) };

  return { requirePro, sheet };
}
