/**
 * The end of the kit chat: what the next stage does, and one button to go
 * there (or, at the last stage, to post the video).
 */
import { useTranslation } from "react-i18next";
import { BUILD_STAGES, stageKeys, type BuildStageId } from "@/lib/build/build-stages";
import { nextStage } from "@/lib/build/stage-plan";

interface NextStageCardProps {
  /** The open stage. */
  stage: BuildStageId;
  onGo: (stage: BuildStageId) => void;
  onPost: () => void;
}

export default function NextStageCard({ stage, onGo, onPost }: NextStageCardProps) {
  const { t } = useTranslation();
  const next = nextStage(stage, BUILD_STAGES);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-dashed border-primary bg-primary/10 px-3.5 py-3 text-[13px] text-foreground">
      <span className="min-w-0 flex-1">
        <b>{t("build.next.label")}</b> {t(next ? stageKeys(next).hint : "build.next.postHint")}
      </span>
      <button
        type="button"
        onClick={() => (next ? onGo(next) : onPost())}
        className="min-h-11 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:min-h-8"
      >
        {next ? t("build.next.go", { stage: t(stageKeys(next).label) }) : t("build.next.post")}
      </button>
    </div>
  );
}
