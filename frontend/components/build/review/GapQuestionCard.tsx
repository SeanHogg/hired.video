/**
 * "The job wants X — where have you done it?" Something the job asks for
 * that the résumé shows no evidence of. Nothing is claimed until the
 * person answers: a skill is a yes / no (it goes to Skills), an experience
 * is one line that becomes a bullet under the job they pick (the one the
 * gap points at by default) — the card says where, and shows the bullet it
 * wrote. "Also add it to my master" (on by default) keeps the
 * answer for the next job. On the page for create-from-a-job; compact in
 * the chat for tailor.
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { JobGap } from "@shared/resume-tailor";
import { defaultTarget, type GapAnswers } from "@/lib/build/review/use-gap-answers";

interface GapQuestionCardProps {
  gap: JobGap;
  answers: GapAnswers;
  /** Show the "also add to master" box on this card (page variant). */
  withMasterToggle?: boolean;
  compact?: boolean;
}

export default function GapQuestionCard({ gap, answers, withMasterToggle, compact }: GapQuestionCardProps) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState("");
  // The person's pick; until then, the job the gap points at.
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const target = picked ?? defaultTarget(gap, answers.targets);
  const answer = answers.answerOf(gap.id);
  const shell = cn(
    "flex flex-col gap-2 rounded-xl border-[1.5px] border-dashed font-sans text-[13.5px]",
    compact ? "border-border p-2.5" : "my-3 border-review-border bg-review/60 p-3 text-review-foreground",
  );

  if (answer.status === "confirmed" || answer.status === "declined") {
    return (
      <div className={cn(shell, "border-solid")}>
        <p className="text-foreground">
          {answer.status === "confirmed"
            ? answer.fact.kind === "skill"
              ? t("review.gap.addedSkill", { text: answer.fact.name })
              : answer.where
                ? t("review.gap.addedBulletTo", { text: answer.fact.text, where: answer.where })
                : t("review.gap.addedBullet", { text: answer.fact.text })
            : t("review.gap.leftOff", { requirement: gap.requirement })}
        </p>
        <Button size="sm" variant="ghost" className="min-h-11 self-start sm:min-h-8" onClick={() => answers.reopen(gap.id)}>
          {t("review.gap.change")}
        </Button>
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <span className="rounded-full bg-review px-1.5 py-0.5 text-[10.5px] text-review-foreground">{gap.id}</span>
        {gap.question}
      </p>
      <p className="text-xs opacity-80">
        {gap.kind === "skill"
          ? t("review.gap.skillGoesTo", { skill: gap.skill || gap.requirement })
          : t("review.gap.howItWorks")}
      </p>
      {withMasterToggle && (
        <label className="flex min-h-11 items-center gap-2 text-xs sm:min-h-0">
          <Checkbox checked={answers.alsoMaster} onCheckedChange={(v) => answers.setAlsoMaster(v === true)} />
          {t("review.gap.alsoMaster")}
        </label>
      )}
      {gap.kind === "skill" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => answers.confirmSkill(gap)}>
            {t("review.gap.haveIt")}
          </Button>
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => answers.decline(gap.id)}>
            {t("review.gap.no")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void answers.answer(gap, text, target);
          }}
        >
          {answers.targets.length > 1 && (
            <label className="flex w-full min-w-0 flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{t("review.gap.addTo")}</span>
              <select
                value={target ?? ""}
                onChange={(e) => setPicked(e.target.value)}
                className="min-h-11 min-w-0 flex-[1_1_180px] truncate rounded-md border border-input bg-card px-2 text-sm text-foreground sm:min-h-9"
              >
                {answers.targets.map((option) => (
                  <option key={option.path} value={option.path}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label htmlFor={id} className="sr-only">
            {t("review.gap.exampleLabel")}
          </label>
          <Input
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("review.gap.examplePlaceholder")}
            className="min-h-11 min-w-0 flex-[1_1_200px] bg-card text-foreground sm:min-h-9"
          />
          <Button type="submit" size="sm" className="min-h-11 sm:min-h-9" disabled={!text.trim() || answer.status === "writing"}>
            {answer.status === "writing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
            {t("review.gap.writeIt")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => answers.decline(gap.id)}>
            {t("actions.skip")}
          </Button>
        </form>
      )}
    </div>
  );
}
