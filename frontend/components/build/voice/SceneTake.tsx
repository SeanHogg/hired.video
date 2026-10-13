/**
 * One scene's own take: record / stop / record again, and "Use <AI voice>
 * instead" to let it go. The Sound panel's My voice list shows it per
 * scene with the words to read (`showScript`); the scene sheet shows it
 * under the scene's words field, so the script is already in view there.
 * Every change is one undo step on the video plan (voice-state.ts).
 */
import { useTranslation } from "react-i18next";
import { Check, Loader2, Mic, Square } from "lucide-react";
import type { VideoSceneId } from "@shared/video-plan";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import { useVoiceTake } from "@/lib/build/use-voice-take";
import { useVoiceSummary } from "@/lib/build/use-voice-summary";
import { withTake } from "@/lib/build/voice-state";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

interface SceneTakeProps {
  video: BuildVideo;
  id: VideoSceneId;
  /** Show the scene's name and the words to read (the panel's list). */
  showScript?: boolean;
}

const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60";

export default function SceneTake({ video, id, showScript = false }: SceneTakeProps) {
  const { t } = useTranslation();
  const take = useVoiceTake();
  const { voiceName } = useVoiceSummary(video.plan);
  const { value: gate, sheet: gateSheet } = useGuestAnonGate();
  const scene = video.plan.scenes?.[id];
  const script = scene?.voiceover?.trim() || video.outline?.scenes.find((s) => s.id === id)?.title || "";
  // A take only plays while the voice is "your own" — the same rule as the timeline.
  const has = Boolean(scene?.voiceClip) && video.plan.voice?.source === "recorded";

  const record = async () => {
    if (gate.isAnon) {
      gate.requireAuth({ reason: "upload", displayReason: t("build.voiceover.gateReason"), onAuthed: () => undefined });
      return;
    }
    const clip = await take.start();
    if (clip) video.updatePlan(withTake(video.plan, id, clip));
  };

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{showScript ? t(SCENE_LABEL_KEYS[id]) : t("build.voice.thisScene")}</span>
        {has && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-green-text">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("build.voice.taken")}
          </span>
        )}
      </div>
      {showScript && script && <p className="rounded-[10px] bg-ink px-3 py-2 text-sm font-semibold leading-snug text-ink-foreground">{script}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {take.state === "recording" ? (
          <button type="button" onClick={take.stop} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-destructive px-3 text-sm font-semibold text-destructive-foreground">
            <Square className="h-4 w-4" aria-hidden="true" /> {t("build.voice.stop", { seconds: take.seconds })}
          </button>
        ) : (
          <button type="button" disabled={take.state === "uploading"} onClick={() => void record()} className={BUTTON}>
            {take.state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mic className="h-4 w-4 text-destructive" aria-hidden="true" />}
            {has ? t("build.voice.retake") : showScript ? t("build.voice.record") : t("build.voice.recordThis")}
          </button>
        )}
        {has && (
          <button type="button" onClick={() => video.patchScene(id, { voiceClip: undefined })} className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground">
            {t("build.voice.useAi", { name: voiceName })}
          </button>
        )}
      </div>
      {take.state === "error" && <p className="text-xs text-destructive">{t("build.voice.micError")}</p>}
      <AuthGateSheet {...gateSheet} />
    </div>
  );
}
