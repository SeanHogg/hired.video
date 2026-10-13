/**
 * Sound › Voice › Upload: one audio file carries the voice over the whole
 * video (one undo step). Uploading needs a session — a signed-out visitor
 * gets the silent guest session first.
 */
import { useTranslation } from "react-i18next";
import { Loader2, Upload } from "lucide-react";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import { useVoiceTake } from "@/lib/build/use-voice-take";
import { withUploadedFile } from "@/lib/build/voice-state";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

export default function VoiceUpload({ video }: { video: BuildVideo }) {
  const { t } = useTranslation();
  const take = useVoiceTake();
  const { value: gate, sheet: gateSheet } = useGuestAnonGate();
  const uploaded = video.plan.voice?.source === "upload";

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (gate.isAnon) {
      gate.requireAuth({ reason: "upload", displayReason: t("build.voiceover.gateReason"), onAuthed: () => undefined });
      return;
    }
    const clip = await take.upload(file);
    if (clip) video.updatePlan(withUploadedFile(video.plan, clip));
  };

  return (
    <>
      <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[12px] border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-6 text-center">
        {take.state === "uploading" ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /> : <Upload className="h-5 w-5 text-primary" aria-hidden="true" />}
        <span className="text-sm font-semibold text-foreground">{uploaded ? t("build.voice.uploaded") : t("build.voice.dropAudio")}</span>
        <span className="text-xs text-muted-foreground">{t("build.voice.uploadHelp")}</span>
        <input type="file" accept="audio/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {take.state === "error" && <p className="text-xs text-destructive">{t("build.voice.uploadError")}</p>}
      <AuthGateSheet {...gateSheet} />
    </>
  );
}
