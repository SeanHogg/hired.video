/**
 * LeftPanelTile — shared 2-column grid tile used by WidgetPalette and
 * ActionsPanel. Single source of truth for icon+label tile dimensions
 * so different label lengths in different tabs don't shift the section
 * title Y positions when the user switches tabs.
 *
 * Fixed `h-16` absorbs 1- vs 2-line label wrapping ("Heading" vs
 * "Original Music") so tiles render at a constant height regardless
 * of which panel hosts them.
 */
import type { ComponentType, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LeftPanelTileProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
}

export default function LeftPanelTile({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  hint,
  draggable,
  onDragStart,
}: LeftPanelTileProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        "h-16 flex-col items-center justify-center gap-1 whitespace-normal px-2 py-2 text-center text-xs leading-tight",
        disabled && "opacity-60",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="line-clamp-2">{label}</span>
    </Button>
  );
}
