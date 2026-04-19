// Drop-in "Run Tool ▸" dropdown submenu. Lists every tool in the registry
// that accepts the current entity type as input, with a PRO indicator on
// paid tools. Inline-runnable tools emit (toolId) via onRunTool so the
// parent can open the quick-run dialog; multi-step tools (e.g. Value
// Proposition) deep-link to their full-page wizard instead.

import { Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { getToolsForContext, isInlineRunnable } from "@/lib/tools/registry";
import type { ToolEntityType } from "@/lib/tools/types";

interface Props {
  entityType: ToolEntityType;
  onRunTool: (toolId: string) => void;
}

export function ToolsSubmenu({ entityType, onRunTool }: Props) {
  const tools = getToolsForContext(entityType);
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
          const inline = isInlineRunnable(tool);
          const body = (
            <>
              <Icon className="w-4 h-4 mr-2" />
              <span className="flex-1">{tool.label}</span>
              <ToolTierBadge
                toolId={tool.id}
                className="ml-2 text-[10px] px-1.5 py-0"
                withIcon={false}
              />
            </>
          );
          return inline ? (
            <DropdownMenuItem key={tool.id} onClick={() => onRunTool(tool.id)}>
              {body}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={tool.id} asChild>
              <Link to={tool.route} className="cursor-pointer">
                {body}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
