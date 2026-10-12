/**
 * "Save as my profile pitch" / "Remove from my profile" for Video Pitch Lab's
 * review step (#1237). Moves the current-pitch pointer to this session's
 * `purpose: "pitch"` studio project via usePitchProject.
 */

import { useTranslation } from "react-i18next";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { usePitchProject } from "@/hooks/use-pitch-project";

interface PitchSaveControlsProps {
  pitch: ReturnType<typeof usePitchProject>;
  /** Fired after the pitch is set (e.g. drop the pending-draft snapshot). */
  onSaved?: () => void;
}

export default function PitchSaveControls({ pitch, onSaved }: PitchSaveControlsProps) {
  const { t } = useTranslation();

  async function run(action: () => Promise<void>, successKey: string, after?: () => void) {
    try {
      await action();
      after?.();
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.couldNotSave"));
    }
  }

  return (
    <>
      <Button
        onClick={() => void run(pitch.makeCurrent, "messages.videoPitch.savedProfilePitch", onSaved)}
        disabled={pitch.saving || pitch.isCurrent || !pitch.projectId}
        className="gap-1"
      >
        {pitch.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {pitch.isCurrent
          ? t("tools.videoPitchLab.savedAsPitch")
          : pitch.currentPitch
            ? t("tools.videoPitchLab.replacePitch")
            : t("tools.videoPitchLab.saveAsPitch")}
      </Button>
      {pitch.isCurrent && (
        <Button
          onClick={() => void run(pitch.removeCurrent, "messages.videoPitch.removedProfilePitch")}
          disabled={pitch.saving}
          variant="outline"
          className="gap-1"
        >
          <X className="h-3.5 w-3.5" />
          {t("tools.videoPitchLab.removePitch")}
        </Button>
      )}
    </>
  );
}
