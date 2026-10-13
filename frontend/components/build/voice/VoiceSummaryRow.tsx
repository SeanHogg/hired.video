/**
 * The whole video's voice as ONE row, for a surface scoped to a single
 * scene (the scene sheet's Voice): the shared status line and a way to the
 * Sound panel, where the voice is chosen. It never repeats the panel.
 */
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { useVoiceSummary } from "@/lib/build/use-voice-summary";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { INSPECTOR_LABEL as LABEL } from "@/components/workspace/inspector/inspector-styles";

interface VoiceSummaryRowProps {
  video: BuildVideo;
  /** Opens Media › Sound. */
  onOpen: () => void;
}

export default function VoiceSummaryRow({ video, onOpen }: VoiceSummaryRowProps) {
  const { t } = useTranslation();
  const { status, label } = useVoiceSummary(video.plan);

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{t("build.voice.wholeVideo")}</span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[10px] border border-border bg-muted/40 px-3 text-left hover:bg-muted"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{t("build.voice.setOnce")}</span>
        </span>
        <span className="inline-flex flex-none items-center text-[13px] font-semibold text-primary">
          {status.kind === "none" ? t("build.voice.choose") : t("build.voice.change")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
