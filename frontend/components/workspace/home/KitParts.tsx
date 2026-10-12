/**
 * KitParts — a kit's three parts as chips: Résumé (always ✓), Cover letter
 * and Video (✓ made / + not yet; the video chip says where it's posted).
 * Shared by every "Your work" view (table row and card).
 */
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { KitRow } from "@/lib/workspace/kits";
import { cn } from "@/lib/utils";

function Part({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
        done ? "bg-brand-green/15 text-brand-green-text" : "bg-muted text-muted-foreground",
      )}
    >
      {done ? "✓ " : "+ "}
      {label}
    </span>
  );
}

/** "Posted to N" when the video is on N channels; "Video posted" when it's
 *  posted but no channel record exists (legacy publish); else "Video". */
function videoLabel(row: KitRow, t: TFunction): string {
  const video = row.video;
  if (video && video.channels > 0) return t("workspace.home.postedTo", { count: video.channels });
  if (video?.posted) return t("workspace.home.videoPosted");
  return t("workspace.page.video");
}

export default function KitParts({ row, className }: { row: KitRow; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <Part done label={t("workspace.page.resume")} />
      <Part done={row.hasLetter} label={t("workspace.page.letter")} />
      <Part done={row.video !== null} label={videoLabel(row, t)} />
    </div>
  );
}
