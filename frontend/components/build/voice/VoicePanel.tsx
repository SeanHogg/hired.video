import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Mic, Square, Upload } from "lucide-react";
import { VIDEO_SCENE_IDS, patchScenePlan, type VideoSceneId } from "@shared/video-plan";
import { listNarrationVoices } from "@/lib/studio/page-narration";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import { useVoiceTake } from "@/lib/build/use-voice-take";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { cn } from "@/lib/utils";
import { INSPECTOR_LABEL as LABEL } from "@/components/workspace/inspector/inspector-styles";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

type Source = "ai" | "recorded" | "upload";
const SOURCES: readonly Source[] = ["ai", "recorded", "upload"];

/** One scene's take: what to read (teleprompter), record / stop, the status. */
function SceneTake({ video, id }: { video: BuildVideo; id: VideoSceneId }) {
  const { t } = useTranslation();
  const take = useVoiceTake();
  const { value: gate, sheet: gateSheet } = useGuestAnonGate();
  const scene = video.plan.scenes?.[id];
  const script = scene?.voiceover?.trim() || video.outline?.scenes.find((s) => s.id === id)?.title || "";
  const has = Boolean(scene?.voiceClip);

  const record = async () => {
    if (gate.isAnon) {
      gate.requireAuth({ reason: "upload", displayReason: t("build.voiceover.gateReason"), onAuthed: () => undefined });
      return;
    }
    const clip = await take.start();
    if (!clip) return;
    // One undo step: the take, and the voice source switches to "recorded".
    const withClip = patchScenePlan(video.plan, id, { voiceClip: clip });
    video.updatePlan({ ...withClip, voice: { source: "recorded", voiceId: video.plan.voice?.source === "ai" ? video.plan.voice.voiceId : undefined } });
  };

  return (
    <li className="flex flex-col gap-2 rounded-[12px] border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{t(SCENE_LABEL_KEYS[id])}</span>
        {has && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-green-text">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("build.voice.taken")}
          </span>
        )}
      </div>
      {script && <p className="rounded-[10px] bg-ink px-3 py-2 text-sm font-semibold leading-snug text-ink-foreground">{script}</p>}
      <div className="flex items-center gap-2">
        {take.state === "recording" ? (
          <button type="button" onClick={take.stop} className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-destructive px-3 text-sm font-semibold text-destructive-foreground">
            <Square className="h-4 w-4" aria-hidden="true" /> {t("build.voice.stop", { seconds: take.seconds })}
          </button>
        ) : (
          <button
            type="button"
            disabled={take.state === "uploading"}
            onClick={() => void record()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            {take.state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mic className="h-4 w-4 text-destructive" aria-hidden="true" />}
            {has ? t("build.voice.retake") : t("build.voice.record")}
          </button>
        )}
        {has && (
          <button type="button" onClick={() => video.patchScene(id, { voiceClip: undefined })} className="min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground">
            {t("build.voice.useAi")}
          </button>
        )}
      </div>
      {take.state === "error" && <p className="text-xs text-destructive">{t("build.voice.micError")}</p>}
      <AuthGateSheet {...gateSheet} />
    </li>
  );
}

/**
 * Voice (Video board): who speaks over the video — an AI voice, your own
 * recorded takes (scenes you skip keep the AI voice), or one uploaded file —
 * and the mix: voice level, music level, and lowering the music under speech.
 * "Add voice to all N scenes" puts the picked AI voice on every scene (the
 * takes give way to it). Every change is one undo step on the video plan.
 */
export default function VoicePanel({ video }: { video: BuildVideo }) {
  const { t } = useTranslation();
  const { plan } = video;
  const source: Source = plan.voice?.source ?? "ai";
  // Unique: the Media tool and the scene's Voice row can both show it.
  const titleId = useId();
  const [tab, setTab] = useState<Source>(source);
  const voices = useQuery({ queryKey: ["narration-voices"], queryFn: listNarrationVoices, staleTime: Infinity });
  const uploadTake = useVoiceTake();
  const { value: gate, sheet: gateSheet } = useGuestAnonGate();
  const onScenes = VIDEO_SCENE_IDS.filter((id) => !plan.scenes?.[id]?.off);
  const voiceId = plan.voice && plan.voice.source !== "upload" ? plan.voice.voiceId : undefined;

  const pickVoice = (id: string) => video.updatePlan({ ...plan, voice: { source: source === "recorded" ? "recorded" : "ai", voiceId: id } });
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (gate.isAnon) {
      gate.requireAuth({ reason: "upload", displayReason: t("build.voiceover.gateReason"), onAuthed: () => undefined });
      return;
    }
    const clip = await uploadTake.upload(file);
    if (clip) video.updatePlan({ ...plan, voice: { source: "upload", url: clip.url, durationSeconds: clip.durationSeconds } });
  };
  const setMix = (patch: { voiceGain?: number; duck?: boolean }) => video.updatePlan({ ...plan, voiceMix: { ...(plan.voiceMix ?? {}), ...patch } }, "video:voice-mix");
  const setMusicVolume = (volume: number) => video.updatePlan({ ...plan, musicMix: { ...(plan.musicMix ?? {}), volume } }, "video:music-mix");
  const firstVoice = voices.data?.[0]?.voice_id;
  // One undo step: the AI voice on every scene, each scene's take let go.
  const voiceAll = () => {
    const cleared = VIDEO_SCENE_IDS.reduce((p, id) => (p.scenes?.[id]?.voiceClip ? patchScenePlan(p, id, { voiceClip: undefined }) : p), plan);
    video.updatePlan({ ...cleared, voice: { source: "ai", voiceId: voiceId ?? firstVoice } });
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className={LABEL}>{t("build.voice.title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("build.voice.subtitle")}</p>
      </div>
      <div role="tablist" aria-label={t("build.voice.source")} className="grid grid-cols-3 gap-1 rounded-[10px] bg-muted p-1">
        {SOURCES.map((s) => (
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

      {tab === "ai" && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("build.voice.tab.ai")}>
          {(voices.data ?? []).length === 0 ? (
            <li className="text-[13px] text-muted-foreground">{voices.isLoading ? t("build.voice.loadingVoices") : t("build.voice.noVoices")}</li>
          ) : (
            (voices.data ?? []).map((v, i) => {
              const on = source !== "upload" && (voiceId ? voiceId === v.voice_id : i === 0);
              return (
                <li key={v.voice_id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickVoice(v.voice_id)}
                    className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] border px-3 text-left text-sm", on ? "border-primary bg-primary/5 font-semibold" : "border-border bg-card hover:bg-muted")}
                  >
                    <span className="min-w-0 truncate">{v.name}</span>
                    {on && <Check aria-hidden="true" className="h-4 w-4 flex-none text-primary" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}

      {tab === "ai" && onScenes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={!voiceId && !firstVoice}
            onClick={voiceAll}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {t("build.voice.addAll", { count: onScenes.length })}
          </button>
          <p className="text-xs text-muted-foreground">{t("build.voice.addAllHelp")}</p>
        </div>
      )}

      {tab === "recorded" && (
        <>
          <p className="text-[13px] text-muted-foreground">{t("build.voice.recordHelp")}</p>
          <ul className="flex flex-col gap-2">{onScenes.map((id) => <SceneTake key={id} video={video} id={id} />)}</ul>
        </>
      )}

      {tab === "upload" && (
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[12px] border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-6 text-center">
          {uploadTake.state === "uploading" ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /> : <Upload className="h-5 w-5 text-primary" aria-hidden="true" />}
          <span className="text-sm font-semibold text-foreground">
            {source === "upload" ? t("build.voice.uploaded") : t("build.voice.dropAudio")}
          </span>
          <span className="text-xs text-muted-foreground">{t("build.voice.uploadHelp")}</span>
          <input type="file" accept="audio/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      )}
      {uploadTake.state === "error" && <p className="text-xs text-destructive">{t("build.voice.uploadError")}</p>}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <label className="flex items-center gap-3 text-sm text-foreground">
          <span className="w-14 flex-none">{t("build.voice.voiceLevel")}</span>
          <input type="range" min={0} max={100} className="flex-1" value={Math.round((plan.voiceMix?.voiceGain ?? 1) * 100)} onChange={(e) => setMix({ voiceGain: Number(e.target.value) / 100 })} />
        </label>
        <label className="flex items-center gap-3 text-sm text-foreground">
          <span className="w-14 flex-none">{t("build.voice.musicLevel")}</span>
          <input type="range" min={0} max={100} className="flex-1" value={Math.round((plan.musicMix?.volume ?? 0.5) * 100)} onChange={(e) => setMusicVolume(Number(e.target.value) / 100)} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="h-4 w-4" checked={plan.voiceMix?.duck ?? false} onChange={(e) => setMix({ duck: e.target.checked })} />
          {t("build.voice.duck")}
        </label>
      </div>
      <AuthGateSheet {...gateSheet} />
    </section>
  );
}
