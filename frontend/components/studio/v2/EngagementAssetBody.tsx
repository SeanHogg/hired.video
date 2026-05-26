/**
 * EngagementAssetBody — DOM renderer for the `engagement-asset` widget.
 * Mounted by `<CanvasStage>` in both edit and playback modes. The
 * per-kind `<meta.InlineBody/>` self-fetches the bound artifact and
 * renders a card preview; this component just provides the chrome
 * (bg / text colours, empty state).
 *
 * Companion of `LinkedContentBody` — same pattern, but the per-kind
 * registry is `ENGAGEMENT_ASSET_REGISTRY` and the seam is
 * project-scoped (the body needs `projectId` to fetch). The parent
 * (CanvasStage → Scene → composition) threads the active project's
 * id down so the body can self-fetch.
 *
 * Self-gating: returns an empty-state card when `assetId === ""` (the
 * widget hasn't been bound yet) or when there's no surrounding
 * projectId — callers don't have to gate.
 */
import { Suspense } from "react";

import {
  getEngagementAssetMeta,
  DEFAULT_ENGAGEMENT_ASSET_COLORS,
  type EngagementAssetColors,
} from "@/lib/studio/editor-v2/engagement-assets";
import type { EngagementAssetWidgetParams } from "@/lib/studio/editor-v2/canvas-state";

interface EngagementAssetBodyProps {
  data: EngagementAssetWidgetParams;
  /** Active project id — required for the per-kind InlineBody to
   *  fetch its row. When absent (composition has no persisted project
   *  yet) we render the "save the project to wire engagement" empty
   *  state instead of crashing. */
  projectId: string | null;
}

export default function EngagementAssetBody({
  data,
  projectId,
}: EngagementAssetBodyProps) {
  const meta = getEngagementAssetMeta(data.assetKind);
  const Icon = meta.icon;
  const InlineBody = meta.InlineBody;
  const colors = resolveColors(data);

  if (!projectId) {
    return (
      <EmptyState
        Icon={Icon}
        label={meta.label}
        message="Save this project to wire engagement assets."
        colors={colors}
      />
    );
  }

  if (!data.assetId) {
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
    <div
      className="relative h-full w-full overflow-hidden rounded-md shadow-sm"
      style={{
        background: colors.bgColor,
        color: colors.textColor,
      }}
    >
      <Suspense
        fallback={
          <div
            className="flex h-full w-full items-center justify-center text-[11px] opacity-70"
            style={{ color: colors.textColor }}
          >
            Loading {meta.label.toLowerCase()}…
          </div>
        }
      >
        <InlineBody projectId={projectId} assetId={data.assetId} />
      </Suspense>
    </div>
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
  colors: EngagementAssetColors;
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md p-4 text-center"
      style={{
        background: colors.bgColor,
        color: colors.textColor,
        boxShadow: `0 0 0 1px ${withAlpha(colors.textColor, 0.25)}`,
      }}
    >
      <Icon className="h-6 w-6 opacity-70" />
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[11px] leading-tight opacity-70">{message}</div>
    </div>
  );
}

function resolveColors(data: EngagementAssetWidgetParams): EngagementAssetColors {
  return {
    bgColor: data.bgColor ?? DEFAULT_ENGAGEMENT_ASSET_COLORS.bgColor,
    textColor: data.textColor ?? DEFAULT_ENGAGEMENT_ASSET_COLORS.textColor,
    accentColor: data.accentColor ?? DEFAULT_ENGAGEMENT_ASSET_COLORS.accentColor,
    accentTextColor:
      data.accentTextColor ?? DEFAULT_ENGAGEMENT_ASSET_COLORS.accentTextColor,
  };
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
