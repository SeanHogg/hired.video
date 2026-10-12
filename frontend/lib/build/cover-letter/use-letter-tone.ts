/**
 * useLetterTone — the inspector's Tone: rewrite the whole letter in one tone,
 * preview it before / after, then Apply (ONE Undo step) or Keep mine.
 *
 *   • FREE (the one AI letter action that isn't Pro). A signed-out visitor
 *     gets a silent guest session first (useGuestAnonGate, reason "ai") and
 *     the rewrite resumes once it exists. The host renders `gateSheet`.
 *   • Apply swaps in ONLY the rewritten body over the letter as it is NOW,
 *     so an edit made while the preview was open (the greeting, the address,
 *     the style) is never lost — and stores the tone on the letter
 *     (`letter.tone`), so the inspector shows it after a reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CoverLetter, CoverLetterTone } from "@shared/cover-letter";
import { matchService } from "@/lib/services/match-service";
import { apiServerErrorCode } from "@/lib/api-error-code";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";

export type LetterToneStatus = "idle" | "rewriting" | "preview" | "failed" | "limited";

export interface LetterTone {
  status: LetterToneStatus;
  /** The tone being written / previewed, or the last one applied. */
  tone: CoverLetterTone | null;
  /** The rewrite on preview (status "preview"). */
  proposal: CoverLetter | null;
  rewrite: (tone: CoverLetterTone) => void;
  apply: () => void;
  keepMine: () => void;
  /** The guest-gate sheet the host must render. */
  /** The sign-up sheet's state — the host renders `<AuthGateSheet {...gateSheet} />`. */
  gateSheet: ReturnType<typeof useGuestAnonGate>["sheet"];
}

/** The proposal's body over `current`, written in `tone` — everything else
 *  stays as it is now. Pure. */
export function withRewrittenBody(current: CoverLetter, proposal: CoverLetter, tone?: CoverLetterTone): CoverLetter {
  return {
    ...current,
    opening: proposal.opening,
    highlightsIntro: proposal.highlightsIntro,
    highlights: proposal.highlights,
    closing: proposal.closing,
    ...(tone ? { tone } : {}),
  };
}

export function useLetterTone(
  letter: CoverLetter,
  onChange: ((letter: CoverLetter, group?: string) => void) | undefined,
): LetterTone {
  const { t } = useTranslation();
  const { value: gate, sheet: gateSheet } = useGuestAnonGate();
  const [status, setStatus] = useState<LetterToneStatus>("idle");
  const [tone, setTone] = useState<CoverLetterTone | null>(null);
  const [proposal, setProposal] = useState<CoverLetter | null>(null);
  // The guest-resume closure runs after a re-render: read the letter then.
  const letterRef = useRef(letter);
  letterRef.current = letter;
  const requestRef = useRef(0);
  useEffect(() => () => void (requestRef.current += 1), []);

  const run = useCallback(async (next: CoverLetterTone) => {
    const request = ++requestRef.current;
    setTone(next);
    setProposal(null);
    setStatus("rewriting");
    try {
      const rewritten = await matchService.rewriteCoverLetterTone({ letter: letterRef.current, tone: next });
      if (request !== requestRef.current) return;
      setProposal(rewritten);
      setStatus("preview");
    } catch (err) {
      if (request !== requestRef.current) return;
      setStatus(apiServerErrorCode(err) === "TOO_MANY_REQUESTS" ? "limited" : "failed");
    }
  }, []);

  const rewrite = useCallback(
    (next: CoverLetterTone) => {
      const go = () => void run(next);
      if (gate.requireAuth({ reason: "ai", displayReason: t("workspace.letter.tone.gateReason"), onAuthed: go })) go();
    },
    [gate, run, t],
  );

  const apply = useCallback(() => {
    if (!proposal || !onChange) return;
    // Its own Undo group (never coalesced with typing or a previous apply).
    onChange(withRewrittenBody(letterRef.current, proposal, tone ?? undefined), `letter:tone:${Date.now()}`);
    setProposal(null);
    setStatus("idle");
  }, [proposal, onChange, tone]);

  const keepMine = useCallback(() => {
    requestRef.current += 1;
    setProposal(null);
    setTone(null);
    setStatus("idle");
  }, []);

  return { status, tone, proposal, rewrite, apply, keepMine, gateSheet };
}
