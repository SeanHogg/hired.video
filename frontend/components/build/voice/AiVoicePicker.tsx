/**
 * The AI voice list (Sound › Voice › AI voice): "No voice" first, then each
 * voice with ▶ to hear it. Picking a voice IS adding it — every scene
 * without words gets its on-screen line to say, in one undo step — so
 * nothing shows as picked while the video is silent. When the owner's own
 * takes cover some scenes, one prompt lets the voice take those too.
 */
import { useTranslation } from "react-i18next";
import { Check, Loader2, Play, Square } from "lucide-react";
import { spokenLines } from "@/lib/build/video-copy";
import { useNarrationVoices, useVoiceSummary } from "@/lib/build/use-voice-summary";
import { useVoicePreview, type PreviewState } from "@/lib/build/use-voice-preview";
import { withAiEverywhere, withVoice, withoutVoice } from "@/lib/build/voice-state";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { cn } from "@/lib/utils";

const ROW = "flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] border px-3 text-left text-sm";
const ROW_ON = "border-primary bg-primary/5 font-semibold";
const ROW_OFF = "border-border bg-card hover:bg-muted";

function PreviewIcon({ state }: { state: PreviewState }) {
  if (state === "loading") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  if (state === "playing") return <Square className="h-3 w-3 fill-current" aria-hidden="true" />;
  return <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />;
}

export default function AiVoicePicker({ video }: { video: BuildVideo }) {
  const { t } = useTranslation();
  const { plan } = video;
  const voices = useNarrationVoices();
  const { status, voiceId, voiceName } = useVoiceSummary(plan);
  const preview = useVoicePreview(t("build.voice.sample"));
  const silent = status.kind === "none" || status.kind === "upload";
  const list = voices.data ?? [];

  const pick = (id: string) => video.updatePlan(withVoice(plan, id, video.outline ? spokenLines(video.outline, t) : {}));

  if (list.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{voices.isLoading ? t("build.voice.loadingVoices") : t("build.voice.noVoices")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">{t("build.voice.pickHelp", { count: status.scenes })}</p>
      <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("build.voice.tab.ai")}>
        <li>
          <button type="button" role="radio" aria-checked={silent} onClick={() => video.updatePlan(withoutVoice(plan))} className={cn(ROW, silent ? ROW_ON : ROW_OFF)}>
            <span>{t("build.voice.none")}</span>
            {silent && <Check aria-hidden="true" className="h-4 w-4 flex-none text-primary" />}
          </button>
        </li>
        {list.map((v) => {
          const on = !silent && v.voice_id === voiceId;
          const state = preview.stateOf(v.voice_id);
          return (
            <li key={v.voice_id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void preview.toggle(v.voice_id)}
                aria-label={state === "idle" ? t("build.voice.hear", { name: v.name }) : t("build.voice.stopHearing", { name: v.name })}
                className={cn(
                  "inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border",
                  state === "idle" ? "border-border bg-muted text-foreground hover:bg-muted/70" : "border-primary bg-primary text-primary-foreground",
                )}
              >
                <PreviewIcon state={state} />
              </button>
              <button type="button" role="radio" aria-checked={on} onClick={() => pick(v.voice_id)} className={cn(ROW, "min-w-0 flex-1", on ? ROW_ON : ROW_OFF)}>
                <span className="min-w-0 truncate">{v.name}</span>
                {on && <Check aria-hidden="true" className="h-4 w-4 flex-none text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>
      {status.takes > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-muted/50 px-3 py-2 text-[13px] text-foreground">
          <span>{t("build.voice.takesKept", { count: status.takes })}</span>
          <button
            type="button"
            onClick={() => video.updatePlan(withAiEverywhere(plan))}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-border bg-card px-3 text-[13px] font-semibold hover:bg-muted"
          >
            {t("build.voice.useEverywhere", { name: voiceName })}
          </button>
        </div>
      )}
    </div>
  );
}
