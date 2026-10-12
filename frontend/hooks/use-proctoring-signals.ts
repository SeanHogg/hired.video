/**
 * useProctoringSignals — tab-blur / paste / copy / fullscreen-exit counters
 * for the AsyncInterviewPage recorder + text editor.
 *
 * Why this exists as a hook rather than inline state:
 *   - Multiple surfaces will record proctoring (async interview now, live
 *     screening room later) and the "did this candidate tab out mid-answer"
 *     question should be answered the same way across both.
 *   - The set of signals expands over time (we'll add accelerometer / heart-
 *     rate hooks from connected wearables eventually); centralising the
 *     accumulator means new signals plug in without retouching every caller.
 *
 * Usage:
 *   const proctoring = useProctoringSignals({ enabled, scope: "question-q1" });
 *   …on submit:
 *   submitInterviewResponse(id, { proctoringFlags: proctoring.snapshot(), … });
 *   …after submit:
 *   proctoring.reset();
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProctoringFlags } from "@/lib/services/interview-assignments-service";

interface UseProctoringSignalsOptions {
  enabled: boolean;
  /** Identifies which question/recorder this hook instance is bound to.
   *  Used only for debug logging — the hook resets every time scope changes. */
  scope?: string;
}

export interface ProctoringHandle {
  flags: ProctoringFlags;
  /** Capture a fresh snapshot — useful right at submit. */
  snapshot: () => ProctoringFlags;
  /** Increment retakesUsed — called by the recorder when a candidate clicks "Re-record". */
  recordRetake: () => void;
  /** Increment prepUsedSec by `sec` — called when the prep countdown ticks. */
  addPrepTime: (sec: number) => void;
  reset: () => void;
}

const ZERO: ProctoringFlags = {
  tabBlurCount: 0,
  pasteCount: 0,
  copyCount: 0,
  fullscreenExits: 0,
  prepUsedSec: 0,
  retakesUsed: 0,
};

export function useProctoringSignals({
  enabled,
  scope,
}: UseProctoringSignalsOptions): ProctoringHandle {
  const ref = useRef<ProctoringFlags>({ ...ZERO });
  // Mirror to state so any consumer that wants to render a live counter can.
  const [flags, setFlags] = useState<ProctoringFlags>(ref.current);

  const tick = useCallback((mutate: (prev: ProctoringFlags) => ProctoringFlags) => {
    ref.current = mutate(ref.current);
    setFlags(ref.current);
  }, []);

  // Reset on scope change.
  useEffect(() => {
    ref.current = { ...ZERO };
    setFlags(ref.current);
  }, [scope]);

  useEffect(() => {
    if (!enabled) return;

    const onBlur = () => tick((p) => ({ ...p, tabBlurCount: p.tabBlurCount + 1 }));
    const onVisibility = () => {
      if (document.hidden) tick((p) => ({ ...p, tabBlurCount: p.tabBlurCount + 1 }));
    };
    const onPaste = () => tick((p) => ({ ...p, pasteCount: p.pasteCount + 1 }));
    const onCopy = () => tick((p) => ({ ...p, copyCount: p.copyCount + 1 }));
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        tick((p) => ({ ...p, fullscreenExits: p.fullscreenExits + 1 }));
      }
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [enabled, tick]);

  const snapshot = useCallback(() => ({ ...ref.current }), []);
  const recordRetake = useCallback(
    () => tick((p) => ({ ...p, retakesUsed: p.retakesUsed + 1 })),
    [tick],
  );
  const addPrepTime = useCallback(
    (sec: number) => tick((p) => ({ ...p, prepUsedSec: p.prepUsedSec + Math.max(0, sec) })),
    [tick],
  );
  const reset = useCallback(() => {
    ref.current = { ...ZERO };
    setFlags(ref.current);
  }, []);

  return { flags, snapshot, recordRetake, addPrepTime, reset };
}
