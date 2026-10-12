/**
 * Left-column nudge once the resume is parsed: the video preview already
 * exists — one tap (the whole card) switches the right pane to it.
 */
import { useTranslation } from "react-i18next";

interface VideoReadyCardProps {
  sceneCount: number;
  seconds: number;
  onWatch: () => void;
}

export default function VideoReadyCard({ sceneCount, seconds, onWatch }: VideoReadyCardProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onWatch}
      className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-2.5 text-left text-foreground transition-colors hover:bg-muted/50"
    >
      <span
        aria-hidden="true"
        className="flex aspect-video w-24 flex-none items-center justify-center rounded-lg bg-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" className="fill-ink-accent">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-sm font-semibold">{t("build.videoReady.title")}</strong>
        <span className="text-[13px] text-muted-foreground">
          {t("build.videoReady.meta", { scenes: sceneCount, seconds })}
        </span>
      </span>
    </button>
  );
}
