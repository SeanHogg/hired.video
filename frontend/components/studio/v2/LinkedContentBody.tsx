/**
 * LinkedContentBody — canvas-side preview for the `linked-content`
 * widget.
 *
 * Layout contract:
 *   - Per-kind `<meta.InlineBody/>` fills the widget edge-to-edge with
 *     the entity's OWN renderer (e.g. `<DeclarativeResumeRenderer/>`
 *     for resumes). This is what makes a resume widget look like the
 *     resume's actual published template, not a hand-rolled summary.
 *   - A floating CTA pill in the bottom-right corner — coloured from
 *     the canvas theme so it sits cleanly on top of any template's
 *     palette. Edit mode renders the pill inert (a `<span>` so clicks
 *     fall through to widget-selection); preview mode renders it as
 *     a real `<a target="_blank">` that opens the entity's canonical
 *     route.
 *
 * Empty state: `entityId === ""` means the widget hasn't been bound to
 * a specific item yet (legacy `defaultWidget("linked-content")` path
 * — palette + drag-drop tiles bind at create time so this is rare).
 * The empty-state card prompts the user to pick from the inspector.
 */
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import {
  getLinkedContentMeta,
  DEFAULT_LINKED_CONTENT_COLORS,
  type LinkedContentColors,
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
  const InlineBody = meta.InlineBody;
  const colors = resolveDataColors(data);

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

  const isPreview = mode === "preview";
  const viewUrl = meta.viewUrl(data.entityId);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md shadow-sm">
      <Suspense
        fallback={
          <div
            className="flex h-full w-full items-center justify-center text-[11px]"
            style={{ color: colors.mutedColor, background: colors.bgColor }}
          >
            Loading {meta.label.toLowerCase()}…
          </div>
        }
      >
        <InlineBody id={data.entityId} />
      </Suspense>
      <CtaPill
        label={meta.ctaLabel}
        url={viewUrl}
        colors={colors}
        isPreview={isPreview}
        onCtaActivate={onCtaActivate}
      />
    </div>
  );
}

/** Floating CTA pill positioned over the inline body. Edit mode is
 *  inert (no `<a>`) so clicks still select the widget for inspection;
 *  preview mode is a real anchor so viewers can jump to the entity. */
function CtaPill({
  label,
  url,
  colors,
  isPreview,
  onCtaActivate,
}: {
  label: string;
  url: string;
  colors: LinkedContentColors;
  isPreview: boolean;
  onCtaActivate?: (url: string) => void;
}) {
  const base =
    "absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-md";
  const style = {
    background: colors.accentColor,
    color: colors.accentTextColor,
  };
  if (isPreview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onCtaActivate?.(url)}
        className={base}
        style={style}
      >
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <span className={base} style={style}>
      {label}
      <ExternalLink className="h-3 w-3" />
    </span>
  );
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
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md p-4 text-center"
      style={{
        background: colors.bgColor,
        color: colors.mutedColor,
        boxShadow: `0 0 0 1px ${withAlpha(colors.mutedColor, 0.4)}`,
      }}
    >
      <span style={{ color: colors.mutedColor }}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="text-xs font-medium" style={{ color: colors.textColor }}>
        {label}
      </div>
      <div className="text-[11px] leading-tight">{message}</div>
    </div>
  );
}

/** Merge per-widget colour overrides with the conservative defaults
 *  shared with `resolveLinkedContentColors`. Extracted so the CTA pill,
 *  empty state, and Suspense fallback all read the same resolved set
 *  — no consumer hand-rolls "use data.bgColor ?? default" inline. */
function resolveDataColors(data: LinkedContentWidgetParams): LinkedContentColors {
  return {
    bgColor: data.bgColor ?? DEFAULT_LINKED_CONTENT_COLORS.bgColor,
    textColor: data.textColor ?? DEFAULT_LINKED_CONTENT_COLORS.textColor,
    mutedColor: data.mutedColor ?? DEFAULT_LINKED_CONTENT_COLORS.mutedColor,
    accentColor: data.accentColor ?? DEFAULT_LINKED_CONTENT_COLORS.accentColor,
    accentTextColor:
      data.accentTextColor ?? DEFAULT_LINKED_CONTENT_COLORS.accentTextColor,
  };
}

/** Apply an alpha multiplier to a `#rrggbb` colour, returning rgba.
 *  Falls through unchanged on non-hex inputs (named colours / rgb()
 *  variants) so the browser still renders something sensible. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
