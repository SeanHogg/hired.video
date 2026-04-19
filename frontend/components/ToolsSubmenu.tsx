// Drop-in "Run Tool ▸" dropdown submenu. Filters the tool registry to the
// tools that accept the current entity type as input, renders them as
// menu items, and emits (toolId) on selection. Designed to sit inside
// any existing DropdownMenu (resume menu, job menu, video menu, …).

import { Wand2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { getToolsForContext, isInlineRunnable } from "@/lib/tools/registry";
import type { ToolEntityType } from "@/lib/tools/types";

interface Props {
  entityType: ToolEntityType;
  onRunTool: (toolId: string) => void;
}

export function ToolsSubmenu({ entityType, onRunTool }: Props) {
  const { isPremium } = useSubscription();
  const tools = getToolsForContext(entityType).filter(isInlineRunnable);
  if (tools.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Wand2 className="w-4 h-4 mr-2" />
        Run Tool
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <DropdownMenuItem key={tool.id} onClick={() => onRunTool(tool.id)}>
              <Icon className="w-4 h-4 mr-2" />
              <span className="flex-1">{tool.label}</span>
              <ToolTierBadge toolId={tool.id} hidden={isPremium} className="ml-2 text-[10px] px-1.5 py-0" withIcon={false} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
