/**
 * Sound › Voice (the Media tool): who speaks over the WHOLE video — an AI
 * voice, the owner's own takes (scenes without one keep the AI voice), one
 * uploaded file, or nobody — with the one status line every voice surface
 * shares (useVoiceSummary). This is the voice's only home: the scene sheet
 * shows a summary row that opens it (VoiceSummaryRow), never a copy.
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { VIDEO_SCENE_IDS } from "@shared/video-plan";
import { useVoiceSummary } from "@/lib/build/use-voice-summary";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { cn } from "@/lib/utils";
import { INSPECTOR_LABEL as LABEL } from "@/components/workspace/inspector/inspector-styles";
import AiVoicePicker from "./AiVoicePicker";
import SceneTake from "./SceneTake";
import VoiceUpload from "./VoiceUpload";

type Tab = "ai" | "recorded" | "upload";
const TABS: readonly Tab[] = ["ai", "recorded", "upload"];

export default function VoicePanel({ video }: { video: BuildVideo }) {
  const { t } = useTranslation();
  const titleId = useId();
  const { status, label } = useVoiceSummary(video.plan);
  const source = video.plan.voice?.source;
  const [tab, setTab] = useState<Tab>(source === "recorded" || source === "upload" ? source : "ai");
  const onScenes = VIDEO_SCENE_IDS.filter((id) => !video.plan.scenes?.[id]?.off);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id={titleId} className={LABEL}>{t("build.voice.title")}</h2>
        <span className={cn("text-xs font-semibold", status.kind === "none" ? "text-muted-foreground" : "text-brand-green-text")} aria-live="polite">
          {label}
        </span>
      </div>
      <div role="tablist" aria-label={t("build.voice.source")} className="grid grid-cols-3 gap-1 rounded-[10px] bg-muted p-1">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={cn("min-h-11 rounded-[8px] px-2 text-[13px] font-semibold", tab === s ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
          >
            {t(`build.voice.tab.${s}`)}
          </button>
        ))}
      </div>

      {tab === "ai" && <AiVoicePicker video={video} />}
      {tab === "recorded" && (
        <>
          <p className="text-[13px] text-muted-foreground">{t("build.voice.recordHelp")}</p>
          <ul className="flex flex-col gap-2">
            {onScenes.map((id) => (
              <li key={id}>
                <SceneTake video={video} id={id} showScript />
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === "upload" && <VoiceUpload video={video} />}
    </section>
  );
}
