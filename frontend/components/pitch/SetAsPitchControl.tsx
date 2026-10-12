/**
 * SetAsPitchControl — "Set as my pitch" / "This is your pitch" inside the
 * studio editor's ⋯ menu (#1237 / #2133).
 *
 * Self-gating: renders nothing unless the signed-in viewer owns the project
 * and it is a video pitch project (`purpose: "pitch"` — the only kind the
 * server accepts as a pitch; its video is the project's newest recorded
 * take). Moves the per-user current-pitch pointer through the typed
 * video-pitch client and refreshes the shared current-pitch query.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { PITCH_PURPOSE, type PitchSummary } from "@shared/pitch";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { apiServerErrorCode } from "@/lib/api-error-code";
import type { StudioProject } from "@/lib/services/studio-service";
import { getCurrentPitch, setCurrentPitch } from "@/lib/services/video-pitch-service";
import { CURRENT_PITCH_QUERY_KEY } from "@/hooks/use-pitch-project";

/** Pure: may this viewer make this project their pitch? */
export function canSetAsPitch(
  project: Pick<StudioProject, "userId" | "mediaKind" | "purpose"> | null,
  viewerId: string | null | undefined,
): boolean {
  if (!project || !viewerId || project.userId !== viewerId) return false;
  return (project.mediaKind ?? "video") === "video" && project.purpose === PITCH_PURPOSE;
}

/** Server refusals with a specific, actionable message. */
const ERROR_KEYS: Record<string, string> = {
  NO_MEDIA: "pitch.recordTakeFirst",
  FORBIDDEN: "pitch.personalOnly",
};

export default function SetAsPitchControl({ project }: { project: StudioProject | null }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const applicable = canSetAsPitch(project, user?.id);
  const { data: currentPitch = null } = useQuery<PitchSummary | null>({
    queryKey: CURRENT_PITCH_QUERY_KEY,
    queryFn: getCurrentPitch,
    enabled: applicable,
  });
  const [saving, setSaving] = useState(false);

  if (!applicable || !project) return null;

  if (currentPitch?.projectId === project.id) {
    return (
      <DropdownMenuItem disabled className="min-h-11 gap-2 text-primary data-[disabled]:opacity-100">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {t("pitch.thisIsYourPitch")}
      </DropdownMenuItem>
    );
  }

  async function makeCurrent(projectId: string) {
    setSaving(true);
    try {
      const pitch = await setCurrentPitch(projectId);
      queryClient.setQueryData(CURRENT_PITCH_QUERY_KEY, pitch);
      await queryClient.invalidateQueries({ queryKey: CURRENT_PITCH_QUERY_KEY });
      toast.success(t("messages.videoPitch.savedProfilePitch"));
    } catch (err) {
      const key = ERROR_KEYS[apiServerErrorCode(err) ?? ""];
      toast.error(key ? t(key) : t("errors.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DropdownMenuItem
      disabled={saving}
      onSelect={() => void makeCurrent(project.id)}
      className="min-h-11 gap-2"
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Video className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {currentPitch ? t("tools.videoPitchLab.replacePitch") : t("pitch.setAsMyPitch")}
    </DropdownMenuItem>
  );
}
