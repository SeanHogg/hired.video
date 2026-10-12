/**
 * The review's side of the kit conversation: the "what should I do with
 * it?" question for an attachment, a match score, then the open review —
 * reading / failed / the kind's own panel (merge queue, tailor changes,
 * requirement checklist). A registry by kind: a new review kind is a new
 * entry here, not a branch elsewhere.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import type { ReviewIntake } from "@/lib/build/review/use-review-intake";
import ConversationBubble from "../ConversationBubble";
import IntentChips from "./IntentChips";
import MergeQueue from "./MergeQueue";
import RequirementChecklist from "./RequirementChecklist";
import TailorPanel from "./TailorPanel";
import CoverLetterCard from "../cover-letter/CoverLetterCard";

type Active = NonNullable<BuildReview["active"]>;

const PANELS: { [K in Active["kind"]]: (review: Extract<Active, { kind: K }>, host: BuildReview) => ReactNode } = {
  merge: (r) => <MergeQueue review={r} />,
  pull: (r) => <MergeQueue review={r} />,
  tailor: (r, host) => <TailorPanel review={r} onSelect={host.select} />,
  fromJob: (r) => <RequirementChecklist review={r} />,
  revise: () => null,
  compare: () => null,
};

function panelFor(active: Active, host: BuildReview): ReactNode {
  return (PANELS[active.kind] as (r: Active, h: BuildReview) => ReactNode)(active, host);
}

interface Props {
  review: BuildReview;
  intake: ReviewIntake;
  /** Show the Letter tab (the job's cover letter is ready). */
  onViewLetter: () => void;
}

export default function ReviewChatPanel({ review, intake, onViewLetter }: Props) {
  const { t } = useTranslation();
  const active = review.active;
  return (
    <>
      <IntentChips intake={intake} />
      {intake.reading && (
        <ConversationBubble from="assistant">
          <span aria-live="polite">{t("review.intake.reading")}</span>
        </ConversationBubble>
      )}
      {intake.needJob && <ConversationBubble from="assistant">{t("review.intake.needJob")}</ConversationBubble>}
      {intake.score && (
        <ConversationBubble from="assistant">
          <p>{t("review.intake.score", { job: intake.score.job, score: intake.score.score })}</p>
          {intake.score.summary && <p className="mt-1 whitespace-pre-line text-[13px] text-muted-foreground">{intake.score.summary}</p>}
        </ConversationBubble>
      )}
      {active && (
        <>
          <ConversationBubble from="user">{t(`review.started.${active.kind}`, { subject: active.subject })}</ConversationBubble>
          {active.status === "loading" && !active.proposed && (
            <ConversationBubble from="assistant">
              <span aria-live="polite">{t(`review.working.${active.kind}`)}</span>
            </ConversationBubble>
          )}
          {active.status === "error" && (
            <ConversationBubble from="assistant">
              <span role="alert">{t(active.errorKey ?? "review.error.generic")}</span>
            </ConversationBubble>
          )}
          {active.status !== "error" && panelFor(active, review)}
          {active.status === "ready" && <CoverLetterCard draft={active.letter} onView={onViewLetter} />}
          {active.kind === "revise" && (
            <ConversationBubble from="assistant">{t("review.revise.intro", { count: active.changes.length })}</ConversationBubble>
          )}
          {active.kind === "compare" && active.status === "ready" && (
            <ConversationBubble from="assistant">{t("review.compare.intro", { count: active.changes.length })}</ConversationBubble>
          )}
        </>
      )}
    </>
  );
}
