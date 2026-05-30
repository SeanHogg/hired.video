/**
 * LayoutPresetMenu — dropdown that switches editor workspace layouts (#349).
 *
 * Mounted near the studio's toolbar so the user can flip between
 * "Editing", "Color", "Audio", "Preview" without re-laying-out manually.
 * Driven by `useLayoutPreset` (single source of truth for the active
 * preset + persistence).
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
import { LayoutDashboard, Check } from "lucide-react";
import {
  LAYOUT_PRESETS,
  type LayoutBindings,
  useLayoutPreset,
} from "@/lib/studio/editor-v2/use-layout-preset";

interface Props {
  onApply: (bindings: LayoutBindings) => void;
  className?: string;
}

export default function LayoutPresetMenu({ onApply, className }: Props) {
  const layout = useLayoutPreset(onApply);
  const active = LAYOUT_PRESETS.find((p) => p.id === layout.presetId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
          title="Workspace layout"
          aria-label="Workspace layout"
        >
          <LayoutDashboard className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">{active?.label ?? "Layout"}</span>
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
              {preset.id === layout.presetId && <Check className="h-3.5 w-3.5" />}
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
  );
}
