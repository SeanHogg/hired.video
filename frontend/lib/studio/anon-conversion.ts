/**
 * Anonymous → signed-up conversion plumbing for the Studio editor (#2212).
 *
 * Adoption play: let UNAUTHENTICATED visitors actually USE the studio
 * (create a video resume / resume / job posting on the canvas) and gate only
 * the value-capture actions (Save / Publish / Export / Download). When the
 * visitor hits a gate we open the in-place auth panel; once they authenticate
 * we "claim" the work-in-progress draft into a real owned project so nothing
 * they made is lost.
 *
 * Two persistence facts this module bridges:
 *   1. The editor already autosaves the in-progress canvas to
 *      `studio.v2.draft.<projectId>` (localStorage) on every change. For an
 *      anonymous visitor `projectId` is the `"new"` sentinel, so their work
 *      lives at `studio.v2.draft.new` with NO server row yet.
 *   2. The usage-tracking session (`hv_visitor_id` → `usage_sessions`) already
 *      upserts `user_id` onto the SAME row the moment the visitor authenticates
 *      (see [usage-tracker.ts] + UsageService.upsertSession). So the pre-signup
 *      → signup funnel is already linked server-side — we only need to EMIT the
 *      studio-specific funnel events onto it.
 *
 * The "pending claim" record below survives the ONE flow where claim can't be
 * instant: choosing *Create account* (vs *Sign in*) requires an email-verify
 * round-trip during which no session exists. We stamp the intent here, send the
 * visitor back to `…?claim=1` after verification, and the editor finishes the
 * claim on their return.
 */
import { trackFunnelStage } from "@/lib/usage-tracker";
import { STUDIO_FUNNEL_FEATURE_KEY } from "@shared/usage";

const PENDING_CLAIM_KEY = "studio.anon.pendingClaim";

/**
 * Gate reasons that need a REAL account (2026-10-03 product rule). Every
 * other server-touching action — save, AI, upload, connect a network, post to
 * ONE destination — runs on a silent guest session (useAuth().ensureGuestSession)
 * with no form; the guest's work is claimed when they sign up / sign in.
 */
const ACCOUNT_ONLY_REASONS: ReadonlySet<string> = new Set(["export", "download", "multi-destination"]);

export function requiresFullAccount(reason: string): boolean {
  return ACCOUNT_ONLY_REASONS.has(reason);
}


/** Query param the auth panel appends to the post-verify redirect so the
 *  editor knows to finish a deferred claim on the visitor's return. */
export const CLAIM_PARAM = "claim";

export interface PendingStudioClaim {
  /** The local draft id to claim — always the `"new"` sentinel today, but
   *  stored explicitly so a future multi-draft anon flow doesn't have to
   *  guess. */
  projectId: string;
  mediaKind: string;
  /** Which gate triggered the conversion (save / publish / export …) — carried
   *  through to the funnel `convert` event so we can see which action drives
   *  the most sign-ups. */
  reason: string;
  at: string;
}

/** Funnel stage. Mapped onto the existing `UsageEventType` wire enum so we
 *  reuse the live ingestion path rather than inventing new event kinds. */
export type StudioFunnelStage = "enter" | "edit" | "gate" | "convert";

/**
 * Emit one studio-funnel event onto the visitor's usage session. No-op without
 * analytics consent (the tracker self-gates), so callers never branch on it.
 */
export function trackStudioFunnel(
  stage: StudioFunnelStage,
  payload: { mediaKind?: string; reason?: string } = {},
): void {
  // enter / edit describe presence + intent; gate / convert are conversion CTAs.
  trackFunnelStage(STUDIO_FUNNEL_FEATURE_KEY, stage, {
    conversion: stage === "gate" || stage === "convert",
    payload,
  });
}

export function markPendingStudioClaim(claim: Omit<PendingStudioClaim, "at">): void {
  try {
    const record: PendingStudioClaim = { ...claim, at: new Date().toISOString() };
    window.localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(record));
  } catch {
    // Private-mode / quota — a failed stamp just means the deferred (signup)
    // claim won't auto-run; the local draft is still intact and the visitor
    // can Save again once back in the editor.
  }
}

export function peekPendingStudioClaim(): PendingStudioClaim | null {
  try {
    const raw = window.localStorage.getItem(PENDING_CLAIM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingStudioClaim>;
    if (!parsed || typeof parsed.projectId !== "string") return null;
    return {
      projectId: parsed.projectId,
      mediaKind: typeof parsed.mediaKind === "string" ? parsed.mediaKind : "video",
      reason: typeof parsed.reason === "string" ? parsed.reason : "save",
      at: typeof parsed.at === "string" ? parsed.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearPendingStudioClaim(): void {
  try {
    window.localStorage.removeItem(PENDING_CLAIM_KEY);
  } catch {
    // ignore
  }
}
