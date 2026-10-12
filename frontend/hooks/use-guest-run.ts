/**
 * useGuestRun — "do this, and if the visitor has no session yet, give them a
 * silent guest session first and do it once that exists."
 *
 * The no-form guest flow (see project_guest_accounts): a signed-out visitor can
 * save / post to ONE destination without filling anything in. Every surface
 * that offers it needs the same three steps — start the guest session, wait for
 * `user` to land in the auth context (the actions read it from their render
 * closure), then resume — so they share this instead of each re-implementing it.
 *
 *   const runAsGuest = useGuestRun({ ready });
 *   if (!runAsGuest(run, onFailed)) return; // queued, or failed → onFailed
 *   run();                                  // already signed in: run inline
 *
 * `ready` (default true) holds the resume until the caller's own precondition
 * is also met (the studio waits for its claimed draft to be saved).
 */
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";

export function useGuestRun({ ready = true }: { ready?: boolean } = {}) {
  const { user, ensureGuestSession } = useAuth();
  const pendingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const run = pendingRef.current;
    if (!run || !user || !ready) return;
    pendingRef.current = null;
    run();
  }, [user, ready]);

  /**
   * True → there is a session; the caller runs the action inline now.
   * False → a guest session is being created and `run` (if given) will fire
   * once it exists; `onFailed` fires instead when no session could be made.
   */
  return useCallback(
    (run: (() => void) | null, onFailed?: () => void): boolean => {
      if (user) return true;
      pendingRef.current = run;
      void ensureGuestSession().then((ok) => {
        if (ok) return;
        pendingRef.current = null;
        onFailed?.();
      });
      return false;
    },
    [user, ensureGuestSession],
  );
}
