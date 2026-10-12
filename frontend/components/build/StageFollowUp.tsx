/**
 * The end of the kit chat: the open stage's "Let AI do this step" card,
 * then where to go next. The same plan card also opens the chat; repeating it
 * here means clicking "Next" lands on what to do at the new stage, right where
 * the visitor is reading — and it scrolls into view whenever the stage changes.
 */
import { useEffect, useRef } from "react";
import type { BuildStageId } from "@/lib/build/build-stages";
import type { StagePlanControls } from "@/lib/build/use-stage-plan";
import { scrollIntoViewWithin } from "@/lib/dom/scroll-within";
import StagePlanCard from "./StagePlanCard";
import NextStageCard from "./NextStageCard";

interface StageFollowUpProps {
  /** The open stage. */
  stage: BuildStageId;
  plan: StagePlanControls;
  onGo: (stage: BuildStageId) => void;
  onPost: () => void;
}

export default function StageFollowUp({ stage, plan, onGo, onPost }: StageFollowUpProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(stage);

  useEffect(() => {
    if (shown.current === stage) return;
    shown.current = stage;
    scrollIntoViewWithin(ref.current, "end");
  }, [stage]);

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <StagePlanCard controls={plan} />
      <NextStageCard stage={stage} onGo={onGo} onPost={onPost} />
    </div>
  );
}
