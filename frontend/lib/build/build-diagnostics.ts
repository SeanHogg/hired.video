/**
 * The kit's state for the developer diagnostics report (DiagnosticsCopyButton):
 * which résumé, how it got here, save + review + chat + video + journey state,
 * what the AI is bound to (the résumé-draft bridge), and a digest of the
 * draft with its content health (lib/diagnostics/resume-digest.ts) — not the
 * full text, which made the report too long to paste. Read at click time
 * through a latest-state ref, so it is always current.
 */
import { useCallback, useRef } from "react";
import { getResumeDraft } from "@/lib/tools/resume-draft-bridge";
import { digestResume } from "@/lib/diagnostics/resume-digest";
import type { useResumeIntake, IntakeSource } from "./use-resume-intake";
import type { useBuildHandoff } from "./use-build-handoff";
import type { BuildStageId } from "./build-stages";
import type { usePostVideo } from "./use-post-video";
import type { useBuildChat, BuildChatTurn } from "./use-build-chat";
import type { useContentHistory } from "./use-content-history";
import type { useWorkspaceReview } from "./review/use-workspace-review";
import type { useBuildVideo } from "./use-build-video";
import type { useResumeInsights } from "./use-resume-insights";

/** The kit hooks' results, as the page already holds them. */
export interface BuildDiagnosticsSources {
  intake: ReturnType<typeof useResumeIntake>;
  handoff: ReturnType<typeof useBuildHandoff>;
  stage: BuildStageId;
  tab: string;
  post: ReturnType<typeof usePostVideo>;
  chat: ReturnType<typeof useBuildChat>;
  history: ReturnType<typeof useContentHistory>;
  review: ReturnType<typeof useWorkspaceReview>["review"];
  video: ReturnType<typeof useBuildVideo>;
  picks: ReturnType<typeof useResumeInsights>;
}

/** Drops a pasted text body (can be long, and the draft already holds it). */
function describeSource(source: IntakeSource | null) {
  if (!source) return null;
  return source.kind === "text" ? { kind: "text", chars: source.text.length } : source;
}

const TURN_TEXT_MAX = 300;

/** Chat turns with long texts clipped (a pasted job post can be 10k chars). */
function clipTurn(turn: BuildChatTurn): BuildChatTurn {
  if (!("text" in turn) || turn.text.length <= TURN_TEXT_MAX) return turn;
  return { ...turn, text: `${turn.text.slice(0, TURN_TEXT_MAX)}… (${turn.text.length} chars)` };
}

/** The open review: what it is, where it stands, what is left. */
function describeReview(review: BuildDiagnosticsSources["review"]) {
  const a = review.active;
  if (!a) return { kind: null };
  return {
    kind: a.kind,
    status: a.status,
    errorKey: a.errorKey,
    subject: a.subject,
    view: review.view,
    changes: a.changes.length,
    reverted: a.changes.filter((c) => c.status === "reverted").length,
    remaining: a.remaining,
    letter: a.letter ? { status: a.letter.status } : null,
  };
}

export function buildDiagnosticsSnapshot(s: BuildDiagnosticsSources) {
  return {
    resumeId: s.handoff.savedResumeId,
    aiBoundTo: getResumeDraft()?.resumeId ?? null,
    intakeStatus: s.intake.status,
    source: describeSource(s.intake.source),
    saveState: s.handoff.saveState,
    stage: s.stage,
    tab: s.tab,
    postOpen: s.post.open,
    chat: { busy: s.chat.busy, turns: s.chat.turns.map(clipTurn) },
    history: { canUndo: s.history.canUndo, canRedo: s.history.canRedo },
    review: describeReview(s.review),
    video: { selected: s.video.selected, sceneCount: s.video.outline?.scenes.length ?? null },
    design: { templateId: s.picks.templateId, structure: s.picks.structure },
    resume: digestResume(s.intake.content),
  };
}

export function useBuildDiagnostics(sources: BuildDiagnosticsSources): () => unknown {
  const ref = useRef(sources);
  ref.current = sources;
  return useCallback(() => buildDiagnosticsSnapshot(ref.current), []);
}
