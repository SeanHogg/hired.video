/**
 * Candidate video pitch surfaces (#2133) — the ONE way a pitch is shown to
 * recruiters and visitors. Every variant plays through the shared
 * <StudioVideoSurface> with `analyticsProjectId` = the pitch's studio
 * project, so pitch views land in the same per-project video analytics as
 * every other studio video.
 *
 *   • <PitchPlayer>       — bare player.
 *   • <PitchCard>         — titled card (public profile, shared résumé).
 *   • <PitchSheetButton>  — compact "Watch pitch" trigger opening a right
 *                           slide-out sheet (dense lists: pipeline cards).
 *
 * All three self-gate: a null pitch renders nothing.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayCircle, Video } from "lucide-react";
import type { PitchSummary } from "@shared/pitch";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface PitchPlayerProps {
  pitch: PitchSummary | null | undefined;
  title?: string;
  className?: string;
}

export function PitchPlayer({ pitch, title, className }: PitchPlayerProps) {
  const { t } = useTranslation();
  if (!pitch) return null;
  return (
    <StudioVideoSurface
      mode="flat"
      source={{ kind: "url", url: pitch.videoUrl }}
      analyticsProjectId={pitch.projectId}
      title={title ?? t("pitch.heading")}
      className={className}
    />
  );
}

export function PitchCard({ pitch, title, className }: PitchPlayerProps) {
  const { t } = useTranslation();
  if (!pitch) return null;
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          {t("pitch.heading")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PitchPlayer pitch={pitch} title={title} className="w-full" />
      </CardContent>
    </Card>
  );
}

interface PitchSheetButtonProps {
  pitch: PitchSummary | null | undefined;
  /** Whose pitch — used in the accessible label and the sheet title. */
  name: string;
  className?: string;
}

export function PitchSheetButton({ pitch, name, className }: PitchSheetButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!pitch) return null;
  const label = t("pitch.watchAria", { name });
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={className ?? "h-7 w-7"}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
      >
        <PlayCircle className="w-3.5 h-3.5 text-primary" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 pr-6">
              <Video className="h-5 w-5" />
              {label}
            </SheetTitle>
          </SheetHeader>
          {open && <PitchPlayer pitch={pitch} title={label} className="w-full" />}
        </SheetContent>
      </Sheet>
    </>
  );
}
