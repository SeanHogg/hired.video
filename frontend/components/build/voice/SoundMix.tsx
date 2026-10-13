/**
 * Sound › Mix: the voice level, the music level and lowering the music
 * under speech — the one place the video's mix is set. A level with
 * nothing to play (no voice, no music) is shown but switched off.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { voiceStatus } from "@/lib/build/voice-state";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { INSPECTOR_LABEL as LABEL } from "@/components/workspace/inspector/inspector-styles";

const ROW = "flex items-center gap-3 text-sm text-foreground aria-disabled:text-muted-foreground";

export default function SoundMix({ video }: { video: BuildVideo }) {
  const { t } = useTranslation();
  const titleId = useId();
  const { plan } = video;
  const silent = voiceStatus(plan).kind === "none";
  const noMusic = video.outline?.music === "none";
  const setMix = (patch: { voiceGain?: number; duck?: boolean }) => video.updatePlan({ ...plan, voiceMix: { ...(plan.voiceMix ?? {}), ...patch } }, "video:voice-mix");
  const setMusicVolume = (volume: number) => video.updatePlan({ ...plan, musicMix: { ...(plan.musicMix ?? {}), volume } }, "video:music-mix");

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className={LABEL}>{t("build.voice.mix")}</h2>
      <label className={ROW} aria-disabled={silent}>
        <span className="w-14 flex-none">{t("build.voice.voiceLevel")}</span>
        <input type="range" min={0} max={100} disabled={silent} className="min-w-0 flex-1 accent-primary" value={Math.round((plan.voiceMix?.voiceGain ?? 1) * 100)} onChange={(e) => setMix({ voiceGain: Number(e.target.value) / 100 })} />
      </label>
      <label className={ROW} aria-disabled={noMusic}>
        <span className="w-14 flex-none">{t("build.voice.musicLevel")}</span>
        <input type="range" min={0} max={100} disabled={noMusic} className="min-w-0 flex-1 accent-primary" value={Math.round((plan.musicMix?.volume ?? 0.5) * 100)} onChange={(e) => setMusicVolume(Number(e.target.value) / 100)} />
      </label>
      <label className={`${ROW} min-h-11 gap-2`} aria-disabled={silent || noMusic}>
        <input type="checkbox" className="h-4 w-4" disabled={silent || noMusic} checked={plan.voiceMix?.duck ?? false} onChange={(e) => setMix({ duck: e.target.checked })} />
        {t("build.voice.duck")}
      </label>
    </section>
  );
}
