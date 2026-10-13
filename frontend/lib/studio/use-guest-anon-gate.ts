/**
 * useGuestAnonGate — an `AnonGateValue` for surfaces OUTSIDE the studio editor
 * that host studio components (the post dock on the kit workspace). Same product rule
 * as the editor's gate (lib/studio/anon-conversion):
 *
 *   • account-only reasons (export / download / the visitor's own "save my
 *     work") open the in-place sign-up sheet and resume once they're signed in;
 *   • everything else runs on a silent guest session — no form — and resumes
 *     as soon as the session exists (useGuestRun).
 *
 * Returns the context value plus the sign-up sheet's state — the host
 * renders it (`<AuthGateSheet {...sheet} />`), so this lib hook renders no UI.
 * The editor keeps its own gate because it also claims anonymous drafts on
 * save; both share useGuestRun for the guest half.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthGateState } from "@/lib/hooks/use-auth-gate-state";
import { useGuestRun } from "@/hooks/use-guest-run";
import { requiresFullAccount } from "@/lib/studio/anon-conversion";
import type { AnonGateValue } from "@/lib/studio/anon-gate-context";
import { useAuth } from "@/lib/auth";

export function useGuestAnonGate() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const runAsGuest = useGuestRun();
  const { requireAuth, sheet } = useAuthGateState({
    // Back to the page they were on — never a different screen.
    redirectTo: `${location.pathname}${location.search}`,
    title: t("studio.anon.gateTitle", { defaultValue: "Save your work" }),
  });

  const value = useMemo<AnonGateValue>(
    () => ({
      isAnon: !user && !isLoading,
      requireAuth: ({ reason, displayReason, onAuthed }) => {
        if (requiresFullAccount(reason)) return requireAuth({ reason: displayReason, onAuthed });
        return runAsGuest(onAuthed, () => {
          // No guest session (rate-limited / offline): the sign-up sheet instead.
          requireAuth({ reason: displayReason, onAuthed });
        });
      },
    }),
    [user, isLoading, requireAuth, runAsGuest],
  );

  return { value, sheet };
}
