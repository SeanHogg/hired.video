// "Run Tool ▸" submenu rendered inside an entity's action menu (resume,
// job, company). Sources every tool from `tools-catalog.ts` so the menu
// stays in lock-step with the public Tools page — the only filter
// applied here is a role gate that hides the seeker Chrome extension
// from recruiters/employers and vice versa.
//
// Items are pure deep-links. The destination tool page reads the entity
// id back off the query string (`?resumeId=…`/`?jobId=…`) and runs
// against it — recording the tool run + entity association via
// `useToolRunRecorder` once the user fires the tool. We deliberately
// don't run inline from this menu; tools have richer page UIs (history
// button, Pro upsells, multi-step wizards) we want users to land in.

import { Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  getCatalogToolsForEntity,
  type ToolEntityContext,
} from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";

interface Props {
  /** What kind of entity this menu was opened from. Drives which tools
   *  receive a `?<entity>Id=…` deep-link param. */
  entityType: ToolEntityContext;
  /** The id of the anchor entity (resume id, job id, …). Forwarded to
   *  the tool page as a query param so the page preselects it. */
  entityId: string;
}

export function ToolsSubmenu({ entityType, entityId }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { canSeeTool } = useRoleAccess();
  // useAuth already resolves SuperAdmin's preview/impersonation role into
  // user.role, so we don't need a separate effective-role hook here. The
  // audience filter lives in getCatalogToolsForEntity; the SuperAdmin per-role
  // hard gate is layered on via canSeeTool (#2038).
  const tools = getCatalogToolsForEntity(entityType, entityId, user?.role).filter(
    (tool) => canSeeTool(tool.id),
  );
  if (tools.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Wand2 className="w-4 h-4 mr-2" />
        {t("tools.runTool", "Run Tool")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[70vh] overflow-y-auto">
        {tools.map((rawTool) => {
          const tool = localizeTool(rawTool, t);
          const Icon = tool.icon;
          return (
            <DropdownMenuItem key={tool.id} asChild>
              <Link to={tool.href} className="cursor-pointer">
                <span
                  className={`w-5 h-5 rounded mr-2 flex items-center justify-center ${tool.iconBgClassName}`}
                >
                  <Icon className={`w-3.5 h-3.5 ${tool.iconColorClassName}`} />
                </span>
                <span className="flex-1">{tool.title}</span>
                {tool.tier === "pro" && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50"
                  >
                    PRO
                  </Badge>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
