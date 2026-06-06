/**
 * PreviewLayoutGroup — joined button group for the v2 studio header that
 * unifies the two previously-separate controls (user request, gap #349
 * follow-on):
 *
 *   ┌────────────┬──────────────┐
 *   │ 👁 Preview  │ ▦ Editing ▾ │
 *   └────────────┴──────────────┘
 *      open the        workspace-layout
 *      playback        dropdown (active
 *      overlay         preset label shown)
 *
 * Before this, the header rendered a standalone "Preview" button (Eye) and,
 * elsewhere in the action row, the workspace-layout dropdown — whose trigger
 * happens to read "Preview" when the Preview *layout* preset is active. Two
 * adjacent "Preview"-labelled controls read as a bug. Folding them into one
 * split-button group (same geometry as StudioSaveMenuV2) makes the
 * relationship explicit: one is the action, one is the mode.
 *
 * The Preview half self-gates on `onOpenPreview`: non-Timeline kinds
 * (game / image — see `usesTimelineChrome`, #936) pass it undefined, so only
 * the layout dropdown renders and the group collapses to a single control.
 * Layout presets apply to every kind (they flip panel visibility, not
 * playback), so the dropdown always renders.
 *
 * Layout state (active preset + localStorage persistence) lives in
 * `useLayoutPreset`; this component is the presentation layer, deferring the
 * actual state flip to the parent via `onApplyLayout` so the editor's
 * setLeftTab / setAdvancedTimelineOpen setters stay co-located.
 */
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Check, Eye, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LAYOUT_PRESETS,
  type LayoutBindings,
  useLayoutPreset,
} from "@/lib/studio/editor-v2/use-layout-preset";

interface Props {
  /** Applies a chosen workspace-layout preset. The parent threads the
   *  bindings through its own state setters (see useLayoutPreset). */
  onApplyLayout: (bindings: LayoutBindings) => void;
  /** Opens the playback PreviewOverlay. Undefined for non-Timeline kinds
   *  (game / image), which collapses the group to just the layout
   *  dropdown — the Preview half doesn't render. */
  onOpenPreview?: () => void;
  className?: string;
}

export default function PreviewLayoutGroup({
  onApplyLayout,
  onOpenPreview,
  className,
}: Props) {
  const layout = useLayoutPreset(onApplyLayout);
  const active = LAYOUT_PRESETS.find((p) => p.id === layout.presetId);
  const hasPreview = !!onOpenPreview;

  return (
    <div className={cn("inline-flex", className)}>
      {hasPreview && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-r-none border-r-0"
          onClick={onOpenPreview}
        >
          <Eye className="h-4 w-4" />
          Preview
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1", hasPreview && "rounded-l-none")}
            title="Workspace layout"
            aria-label="Workspace layout"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="text-xs">{active?.label ?? "Layout"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
            Workspace layout
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LAYOUT_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => layout.apply(preset.id)}
              className="flex items-start gap-2 py-2"
            >
              <div className="w-4 h-4 mt-0.5 flex-shrink-0">
                {preset.id === layout.presetId && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{preset.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  {preset.description}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
