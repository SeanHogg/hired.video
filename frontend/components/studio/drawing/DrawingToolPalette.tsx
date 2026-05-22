/**
 * DrawingStage tool palette — left rail with the MVP toolset
 * (brush / eraser / fill / eyedropper) + brush settings (size,
 * opacity, hardness) + color picker with recent-color swatches.
 *
 * Per #932 phase 1 the MVP covers the most common Photoshop tools
 * users reach for first; selections / shapes / text / filters land in
 * follow-on phases tracked on the gap register.
 */

import { Brush, Eraser, PaintBucket, Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BrushSettings, DrawingTool } from "@/lib/studio/drawing/drawing-types";
import { MAX_RECENT_COLORS } from "@/lib/studio/drawing/drawing-types";

interface DrawingToolPaletteProps {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  brush: BrushSettings;
  onBrushChange: (next: BrushSettings) => void;
  recentColors: ReadonlyArray<string>;
}

const TOOL_DEFS: ReadonlyArray<{
  id: DrawingTool;
  label: string;
  shortcut: string;
  icon: typeof Brush;
}> = [
  { id: "brush", label: "Brush", shortcut: "B", icon: Brush },
  { id: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
  { id: "fill", label: "Fill", shortcut: "G", icon: PaintBucket },
  { id: "eyedropper", label: "Eyedropper", shortcut: "I", icon: Pipette },
];

export default function DrawingToolPalette({
  tool,
  onToolChange,
  brush,
  onBrushChange,
  recentColors,
}: DrawingToolPaletteProps) {
  return (
    <div className="flex w-56 flex-col gap-4 border-r bg-background p-3">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tools
        </p>
        <div className="grid grid-cols-4 gap-1">
          {TOOL_DEFS.map((def) => {
            const Icon = def.icon;
            const active = tool === def.id;
            return (
              <Tooltip key={def.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={active ? "default" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => onToolChange(def.id)}
                    aria-label={def.label}
                    aria-pressed={active}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {def.label} ({def.shortcut})
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs">Size</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {brush.size}px
            </span>
          </div>
          <Slider
            min={1}
            max={200}
            step={1}
            value={[brush.size]}
            onValueChange={([next]) =>
              onBrushChange({ ...brush, size: next ?? brush.size })
            }
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs">Opacity</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(brush.opacity * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(brush.opacity * 100)]}
            onValueChange={([next]) =>
              onBrushChange({ ...brush, opacity: (next ?? 100) / 100 })
            }
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs">Hardness</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(brush.hardness * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(brush.hardness * 100)]}
            onValueChange={([next]) =>
              onBrushChange({ ...brush, hardness: (next ?? 60) / 100 })
            }
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Color
          </Label>
          <span className="text-xs tabular-nums uppercase text-muted-foreground">
            {brush.color}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={brush.color}
            onChange={(e) =>
              onBrushChange({ ...brush, color: e.target.value })
            }
            className="h-9 w-12 cursor-pointer p-1"
            aria-label="Pick brush color"
          />
          <Input
            type="text"
            value={brush.color}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                onBrushChange({ ...brush, color: v });
              }
            }}
            className="h-9 flex-1 font-mono text-xs"
            spellCheck={false}
          />
        </div>
        {recentColors.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Recent
            </p>
            <div className="grid grid-cols-8 gap-1">
              {recentColors.slice(0, MAX_RECENT_COLORS).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "h-5 w-5 rounded border border-border transition-transform hover:scale-110",
                    color === brush.color && "ring-2 ring-primary",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => onBrushChange({ ...brush, color })}
                  aria-label={`Use ${color}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
