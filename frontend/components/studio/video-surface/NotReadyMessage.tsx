import { useTranslation } from "react-i18next";
import { mediaKindNotReadyKey } from "@shared/media-kinds";

/** Shared empty-state used by the public-dispatch surfaces. Kind-aware
 *  copy ("This podcast isn't ready yet") comes from the one per-kind key
 *  map in `shared/media-kinds/ui-hints.ts`; a missing / unknown kind falls
 *  back to the generic "media" sentence so a stale-payload viewer never
 *  sees video-language on a non-video project. */
export default function NotReadyMessage({
  mediaKind,
  className,
}: {
  mediaKind?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`aspect-video rounded-xl overflow-hidden bg-black/5 border border-border shadow-lg flex items-center justify-center ${className ?? ""}`}
    >
      <p className="text-muted-foreground text-sm px-4 text-center break-words">
        {t(mediaKindNotReadyKey(mediaKind))}
      </p>
    </div>
  );
}
