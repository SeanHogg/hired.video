/**
 * Anonymous adoption (#2212) for the studio editor: the action gate every
 * server-touching control goes through, the AnonGateContext value, the
 * funnel's "enter" event, and the claim-on-return that persists a signed-out
 * draft once the visitor authenticates. Lifted out of StudioEditorV2. The
 * gate's sheet is returned as state (`gateSheet`); the editor renders it as
 * `<AuthGateSheet>` (components/auth/useAuthGate).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MediaKind } from "@shared/media-kinds";
import type { User } from "@/lib/auth";
import type { StudioProject } from "@/lib/services/studio-service";
import { useAuthGateState } from "@/lib/hooks/use-auth-gate-state";
import { useGuestRun } from "@/hooks/use-guest-run";
import type { AnonGateValue } from "@/lib/studio/anon-gate-context";
import {
  CLAIM_PARAM,
  clearPendingStudioClaim,
  markPendingStudioClaim,
  peekPendingStudioClaim,
  requiresFullAccount,
  trackStudioFunnel,
} from "@/lib/studio/anon-conversion";

/** Gate a server-touching action: true → proceed now; false → it resumes
 *  once the visitor has a session (or an account, for account-only ones). */
export type GateAction = (reason: string, displayReason: string, run: () => void) => boolean;

export interface AnonAdoptionInput {
  user: User | null;
  authLoading: boolean;
  projectId: string;
  currentMediaKind: MediaKind;
  persistedProjectId: string | null;
  searchParams: URLSearchParams;
}

export function useAnonAdoption({
  user,
  authLoading,
  projectId,
  currentMediaKind,
  persistedProjectId,
  searchParams,
}: AnonAdoptionInput) {
  const { t } = useTranslation();
  // ─── Anonymous adoption (#2212): let signed-out visitors USE the studio,
  // gate only the value-capture actions (Save / Publish / Export), and claim
  // their work-in-progress draft into a real owned project the moment they
  // authenticate. The conversion funnel runs on the existing usage-tracking
  // session (hv_visitor_id → usage_sessions), which already upserts user_id on
  // auth — so the pre-signup → signup journey is linked server-side and we only
  // emit studio-specific funnel events. See [lib/studio/anon-conversion.ts].
  const isAnonVisitor = !user && !authLoading;
  // Last gate-trigger reason — stamped onto the deferred-claim record + the
  // convert funnel event so we can see which action drives the most sign-ups.
  const lastGateReasonRef = useRef<string>("save");
  // Post-verify return target for the signup branch. Preserves the URL params
  // (notably ?contentTemplate=) so the rehydrated draft re-opens as the SAME
  // media kind, plus ?claim=1 so the editor finishes the deferred claim.
  const claimRedirect = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.set(CLAIM_PARAM, "1");
    return `/studio/${encodeURIComponent(projectId)}?${params.toString()}`;
    // Mount-time snapshot only — later param edits shouldn't move the target.
  }, []);
  const { requireAuth, sheet: gateSheet } = useAuthGateState({
    redirectTo: claimRedirect,
    title: t("studio.anon.gateTitle", { defaultValue: "Save your work" }),
    onSignupSubmitted: () =>
      markPendingStudioClaim({
        projectId,
        mediaKind: currentMediaKind,
        reason: lastGateReasonRef.current,
      }),
  });

  // Silent guest session → resume. Holds the resumed action until the claim
  // effect below has also saved a never-saved draft (shared primitive).
  const runAsGuest = useGuestRun({ ready: !!persistedProjectId });

  /** Gate a server-touching action. Account-only actions (export / download /
   *  the visitor's own "save my work" — `requiresFullAccount`) open the in-place auth
   *  panel for anyone without a real account, emit the `gate` funnel event and
   *  return false, re-running `run` (and emitting `convert`) once they sign
   *  in. Everything else proceeds for any signed-in visitor, guest included;
   *  a signed-out visitor gets a silent guest session first (no form), their
   *  draft is claimed into a real project, and `run` resumes. */
  const gateAction = useCallback<GateAction>(
    (reason, displayReason, run) => {
      lastGateReasonRef.current = reason;
      if (!requiresFullAccount(reason)) {
        if (user) return true;
        markPendingStudioClaim({ projectId, mediaKind: currentMediaKind, reason });
        // "save" is completed by the claim effect itself — don't run it twice.
        return runAsGuest(reason === "save" ? null : run, () => {
          // No guest session (rate-limited / offline): fall back to the panel.
          clearPendingStudioClaim();
          requireAuth({ reason: displayReason, onAuthed: run });
        });
      }
      const ok = requireAuth({
        reason: displayReason,
        onAuthed: () => {
          trackStudioFunnel("convert", { mediaKind: currentMediaKind, reason });
          run();
        },
      });
      if (!ok) trackStudioFunnel("gate", { mediaKind: currentMediaKind, reason });
      return ok;
    },
    [requireAuth, currentMediaKind, user, runAsGuest, projectId],
  );

  // Expose the gate to every server-touching descendant (AI generation,
  // media upload, save-to-library …) so they self-gate without prop-drilling
  // (#2214). No-op for authenticated users — `gateAction` returns true.
  const anonGateValue = useMemo<AnonGateValue>(
    () => ({
      isAnon: isAnonVisitor,
      requireAuth: (req) => gateAction(req.reason, req.displayReason, req.onAuthed),
    }),
    [isAnonVisitor, gateAction],
  );

  // Funnel: "enter" once when a signed-out visitor opens the editor.
  const enterTrackedRef = useRef(false);
  useEffect(() => {
    if (isAnonVisitor && !enterTrackedRef.current) {
      enterTrackedRef.current = true;
      trackStudioFunnel("enter", { mediaKind: currentMediaKind });
    }
  }, [isAnonVisitor, currentMediaKind]);

  return { isAnonVisitor, gateAction, anonGateValue, gateSheet };
}

export interface ClaimOnReturnInput {
  user: User | null;
  searchParams: URLSearchParams;
  projectId: string;
  persistedProjectId: string | null;
  currentMediaKind: MediaKind;
  documentStateHydrated: boolean;
  handleSave: () => Promise<StudioProject | null>;
}

export function useClaimOnReturn({
  user,
  searchParams,
  projectId,
  persistedProjectId,
  currentMediaKind,
  documentStateHydrated,
  handleSave,
}: ClaimOnReturnInput) {
  // Claim-on-return: an authenticated visitor arriving with ?claim=1 (or a
  // pending-claim record) and no server row yet → persist the rehydrated local
  // draft into a real owned project, then drop the marker. Covers the signup →
  // email-verify round-trip where claim couldn't complete inline.
  const claimDoneRef = useRef(false);
  useEffect(() => {
    if (claimDoneRef.current || !user) return;
    const wantsClaim =
      searchParams.get(CLAIM_PARAM) === "1" ||
      peekPendingStudioClaim()?.projectId === projectId;
    if (!wantsClaim) return;
    if (persistedProjectId) {
      // A real project already exists (claimed inline) — just drop the marker.
      claimDoneRef.current = true;
      clearPendingStudioClaim();
      return;
    }
    // Document drafts need their runtime hydrated before the save reads it;
    // Timeline kinds seed `state` synchronously so they're always ready.
    if (currentMediaKind === "document" && !documentStateHydrated) return;
    claimDoneRef.current = true;
    const reason = peekPendingStudioClaim()?.reason ?? "save";
    void (async () => {
      const saved = await handleSave();
      if (saved) {
        trackStudioFunnel("convert", { mediaKind: currentMediaKind, reason });
        clearPendingStudioClaim();
      } else {
        // Let a later manual Save retry — un-latch so the user isn't stuck.
        claimDoneRef.current = false;
      }
    })();
    // handleSave is re-created every render, closing over live state.
  }, [user, persistedProjectId, documentStateHydrated, currentMediaKind, projectId, searchParams]);
}
