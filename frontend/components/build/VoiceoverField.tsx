/**
 * Voiceover — what the owner says over one scene of the résumé video. Saved on
 * the video plan (`plan.scenes[id].voiceover`) through `onPatch`, so Undo
 * covers it; typing coalesces into one undo step.
 *
 * useSceneVoiceovers turns the words into narration. That uploads the audio,
 * which needs a session, so the first words typed by a signed-out visitor
 * start the silent guest session — the same guest-first gate as the post dock,
 * never a form.
 */
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { VideoPlan, VideoSceneId } from "@shared/video-plan";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import type { ScenePatch } from "@/lib/build/use-build-video";
import { INSPECTOR_LABEL as LABEL } from "@/components/workspace/inspector/inspector-styles";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

interface VoiceoverFieldProps {
  sceneId: VideoSceneId;
  plan: VideoPlan;
  onPatch: (patch: ScenePatch, group?: string) => void;
}

const VOICEOVER_MAX = 600;
const FIELD =
  "w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function VoiceoverField({ sceneId, plan, onPatch }: VoiceoverFieldProps) {
  const { t } = useTranslation();
  const ids = useId();
  const { value: gate, sheet: gateSheet } = useGuestAnonGate();
  const askedForSession = useRef(false);
  const text = plan.scenes?.[sceneId]?.voiceover ?? "";

  const change = (next: string) => {
    onPatch({ voiceover: next || undefined }, `video:${sceneId}:voiceover`);
    if (next.trim() && gate.isAnon && !askedForSession.current) {
      askedForSession.current = true;
      // Nothing to resume: generation starts by itself once the session lands.
      gate.requireAuth({ reason: "upload", displayReason: t("build.voiceover.gateReason"), onAuthed: () => undefined });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${ids}-voiceover`} className={LABEL}>
          {t("build.voiceover.label")}
        </label>
        <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">
          {t("build.voiceover.count", { length: text.length, max: VOICEOVER_MAX })}
        </span>
      </div>
      <textarea
        id={`${ids}-voiceover`}
        value={text}
        maxLength={VOICEOVER_MAX}
        rows={3}
        placeholder={t("build.voiceover.placeholder")}
        aria-describedby={`${ids}-voiceover-help`}
        onChange={(e) => change(e.target.value)}
        className={FIELD}
      />
      <p id={`${ids}-voiceover-help`} className="text-[13px] text-muted-foreground">
        {t("build.voiceover.help")}
      </p>
      <AuthGateSheet {...gateSheet} />
    </div>
  );
}
