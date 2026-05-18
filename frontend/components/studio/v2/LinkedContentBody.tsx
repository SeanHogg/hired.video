/**
 * LinkedContentBody — canvas-side preview for the `linked-content`
 * widget. Self-fetches the entity's preview projection via the linked-
 * content registry and renders a generic card (title / subtitle / body /
 * chips / CTA). One body component serves every entity kind — per-kind
 * semantics live in `LINKED_CONTENT_REGISTRY[entityKind].fetchPreview`.
 *
 * Theme awareness: the five colour fields on `LinkedContentWidgetParams`
 * (`bgColor`, `textColor`, `mutedColor`, `accentColor`, `accentTextColor`)
 * are stamped at insert time from the active theme / palette via
 * `resolveLinkedContentColors()`, so a card dropped into a dark cinematic
 * template renders dark, and a card dropped into a bright template
 * renders bright. When the fields are absent (legacy widgets, no theme),
 * `DEFAULT_LINKED_CONTENT_COLORS` is the fallback — single source of
 * truth shared with `resolveLinkedContentColors`.
 *
 * Empty state: when `entityId` is "" the widget renders a prompt to
 * pick an entity from the inspector. This happens only for widgets
 * authored before binding (e.g. created via the legacy
 * `defaultWidget("linked-content")` path) — palette + drag-drop tiles
 * bind the entity at creation time so the empty state shouldn't appear
 * during normal use.
 *
 * Mode contract matches the rest of `CanvasStage`'s widget bodies:
 *   - `edit`    — CTA renders as an inert chip so clicks select the
 *                 widget for inspector editing.
 *   - `preview` — CTA is a live `<a target="_blank">` opening the
 *                 entity's canonical route.
 */
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  getLinkedContentMeta,
  DEFAULT_LINKED_CONTENT_COLORS,
  type LinkedContentColors,
  type LinkedContentPreview,
} from "@/lib/studio/editor-v2/linked-content";
import type { LinkedContentWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import type { CanvasStageMode } from "./CanvasStage";

interface LinkedContentBodyProps {
  data: LinkedContentWidgetParams;
  mode: CanvasStageMode;
  onCtaActivate?: (url: string) => void;
}

export default function LinkedContentBody({
  data,
  mode,
  onCtaActivate,
}: LinkedContentBodyProps) {
  const meta = getLinkedContentMeta(data.entityKind);
  const Icon = meta.icon;
  const colors = useMemo<LinkedContentColors>(
    () => ({
      bgColor: data.bgColor ?? DEFAULT_LINKED_CONTENT_COLORS.bgColor,
      textColor: data.textColor ?? DEFAULT_LINKED_CONTENT_COLORS.textColor,
      mutedColor: data.mutedColor ?? DEFAULT_LINKED_CONTENT_COLORS.mutedColor,
      accentColor: data.accentColor ?? DEFAULT_LINKED_CONTENT_COLORS.accentColor,
      accentTextColor:
        data.accentTextColor ?? DEFAULT_LINKED_CONTENT_COLORS.accentTextColor,
    }),
    [
      data.bgColor,
      data.textColor,
      data.mutedColor,
      data.accentColor,
      data.accentTextColor,
    ],
  );
  const [preview, setPreview] = useState<LinkedContentPreview | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!data.entityId) {
      setPreview(null);
      setLoadState("idle");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    meta
      .fetchPreview(data.entityId)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setLoadState(p ? "idle" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [data.entityId, meta]);

  if (!data.entityId) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message={`Pick a ${meta.label.toLowerCase()} from the inspector`}
        colors={colors}
      />
    );
  }

  if (loadState === "loading" && !preview) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message={`Loading ${meta.label.toLowerCase()}…`}
        colors={colors}
      />
    );
  }

  if (!preview) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message={`Couldn't load this ${meta.label.toLowerCase()}.`}
        colors={colors}
      />
    );
  }

  const isPreview = mode === "preview";
  const viewUrl = meta.viewUrl(preview.id);
  const ctaBaseClass =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm";

  return (
    <div
      className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-md p-4 shadow-sm"
      style={{
        background: colors.bgColor,
        color: colors.textColor,
        boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      }}
    >
      <header className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            background: withAlpha(colors.accentColor, 0.15),
            color: colors.accentColor,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-base font-semibold leading-tight"
            style={{ color: colors.textColor }}
          >
            {preview.title}
          </div>
          {preview.subtitle && (
            <div
              className="truncate text-xs"
              style={{ color: colors.mutedColor }}
            >
              {preview.subtitle}
            </div>
          )}
        </div>
      </header>

      {preview.body && (
        <p
          className="line-clamp-4 text-sm leading-snug"
          style={{ color: colors.mutedColor }}
        >
          {preview.body}
        </p>
      )}

      {preview.chips && preview.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preview.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: withAlpha(colors.textColor, 0.08),
                color: colors.textColor,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2">
        {isPreview ? (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onCtaActivate?.(viewUrl)}
            className={ctaBaseClass}
            style={{
              background: colors.accentColor,
              color: colors.accentTextColor,
            }}
          >
            {meta.ctaLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span
            className={ctaBaseClass}
            style={{
              background: colors.accentColor,
              color: colors.accentTextColor,
            }}
          >
            {meta.ctaLabel}
            <ExternalLink className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

/** Apply an alpha multiplier to a hex `#rrggbb` colour, returning an
 *  rgba string. Used for the accent-tinted icon chip + chip backgrounds
 *  so the card chrome stays cohesive across themes without per-theme
 *  manual tuning. Falls through to the input when the hex is unparseable
 *  (named colours / rgb() inputs are passed through unchanged so the
 *  browser still renders something sensible). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function EmptyState({
  Icon,
  label,
  message,
  colors,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  message: string;
  colors: LinkedContentColors;
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md p-4 text-center ring-1 ring-dashed"
      style={{
        background: withAlpha(colors.bgColor, 0.95),
        color: colors.mutedColor,
        // Tailwind's ring colour can't read inline custom colours; emulate
        // via boxShadow so the dashed outline picks up the muted colour.
        boxShadow: `0 0 0 1px ${withAlpha(colors.mutedColor, 0.4)}`,
      }}
    >
      <span style={{ color: colors.mutedColor }}>
        <Icon className="h-6 w-6" />
      </span>
      <div
        className="text-xs font-medium"
        style={{ color: colors.textColor }}
      >
        {label}
      </div>
      <div className="text-[11px] leading-tight">{message}</div>
    </div>
  );
}
