/**
 * LinkedContentBody — canvas-side preview for the `linked-content`
 * widget. Lives inside the EDIT canvas only — playback is now the
 * canvas-v2 renderer's job (`CanvasV2Preview` → `canvas-v2:linked-content`
 * applier), so this component never has to render a "playback CTA"
 * variant. Per-kind `<meta.InlineBody/>` paints the entity using its
 * OWN React renderer (e.g. `<DeclarativeResumeRenderer/>`) so the
 * authoring surface shows a faithful preview of the bound entity.
 * The floating CTA pill is always inert (a `<span>`) — clicks fall
 * through to the surrounding widget-selection handler.
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

interface LinkedContentBodyProps {
  data: LinkedContentWidgetParams;
}

export default function LinkedContentBody({ data }: LinkedContentBodyProps) {
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
      <CtaPill label={meta.ctaLabel} colors={colors} />
    </div>
  );
}

/** Inert floating CTA pill positioned over the inline body — clicks
 *  fall through to widget selection. The canvas-v2 renderer draws an
 *  interactive equivalent for the playback / export surface. */
function CtaPill({ label, colors }: { label: string; colors: LinkedContentColors }) {
  return (
    <span
      className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-md"
      style={{ background: colors.accentColor, color: colors.accentTextColor }}
    >
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
