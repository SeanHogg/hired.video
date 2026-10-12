/**
 * Visual scene-boundary track for the Engagement tab — a proportional
 * bar plus a timestamped list so the Chapter dialog's auto-seed source
 * is visible even when the details drawer has no live canvas.
 */
import { useTranslation } from "react-i18next";

import { formatSceneTimestamp, type ChapterSeed } from "./scene-boundaries";

export function SceneBoundaryTrack({ seed }: { seed: ChapterSeed }) {
  const { t } = useTranslation();
  const heading = t("studio.engagement.sceneBoundaries", {
    defaultValue: "Scene boundaries",
  });

  if (seed.sceneBoundaries.length === 0) {
    return (
      <div
        data-testid="scene-boundary-track"
        className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
      >
        {t("studio.engagement.noSceneBoundaries", {
          defaultValue:
            "No scene boundaries yet. Add scenes in the editor, or enter chapter times by hand.",
        })}
      </div>
    );
  }

  const spans = seed.sceneBoundaries.map((b, i) => {
    const next = seed.sceneBoundaries[i + 1]?.start ?? seed.durationSec;
    return Math.max(0, next - b.start);
  });
  const spanTotal = spans.reduce((sum, w) => sum + w, 0) || 1;

  return (
    <section
      data-testid="scene-boundary-track"
      aria-label={heading}
      className="space-y-2"
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">{heading}</h3>
          <p className="text-xs text-muted-foreground">
            {t("studio.engagement.sceneBoundariesHint", {
              defaultValue:
                "Chapter markers auto-seed from these scene start times.",
            })}
          </p>
        </div>
        <p
          data-testid="scene-boundary-duration"
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {t("studio.engagement.duration", {
            duration: formatSceneTimestamp(seed.durationSec),
            defaultValue: "Duration {{duration}}",
          })}
        </p>
      </header>
      <div
        className="flex h-10 overflow-hidden rounded-md border border-border"
        role="presentation"
      >
        {seed.sceneBoundaries.map((b, i) => {
          const widthPct = (spans[i] / spanTotal) * 100;
          return (
            <div
              key={`${b.start}-${b.title}-${i}`}
              title={`${b.title} · ${formatSceneTimestamp(b.start)}`}
              style={{ width: `${Math.max(widthPct, 2)}%` }}
              className="flex items-center justify-center truncate border-r border-border bg-muted/50 px-1 text-xs last:border-r-0"
            >
              {b.title}
            </div>
          );
        })}
      </div>
      <ol className="space-y-1">
        {seed.sceneBoundaries.map((b, i) => (
          <li
            key={`${b.start}-${b.title}-${i}`}
            data-testid="scene-boundary"
            className="flex items-center gap-2 text-sm"
          >
            <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatSceneTimestamp(b.start)}
            </span>
            <span className="truncate">{b.title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
