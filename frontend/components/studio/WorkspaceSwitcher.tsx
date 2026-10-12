// WorkspaceSwitcher — dropdown that lets the user choose which workspace
// they're acting through in Studio (personal / company / delegated).
//
// Self-gating per the project DRY rule: when the current user has no
// workspaces beyond personal (eg job seekers with no company memberships
// and no delegations) the component returns null. Consumers never need
// to wrap it in their own visibility check.

import { ChevronDown, Building2, User, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useWorkspace, type WorkspaceSelection } from "@/lib/hooks/useWorkspace";

export default function WorkspaceSwitcher() {
  const { selection, setSelection, workspaces, hasMultipleWorkspaces } = useWorkspace();

  // Self-gate: nothing to switch between, nothing to render.
  if (!hasMultipleWorkspaces || !workspaces) return null;

  const currentLabel = labelFor(selection, workspaces);
  const Icon = iconFor(selection);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-medium truncate max-w-[140px]">{currentLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Acting as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSelection({ kind: "personal" })}>
          <User className="w-4 h-4 mr-2" /> {workspaces.personal.label}
        </DropdownMenuItem>

        {workspaces.companies.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Companies
            </DropdownMenuLabel>
            {workspaces.companies.map((c) => (
              <DropdownMenuItem
                key={c.companyId}
                onClick={() => setSelection({ kind: "company", companyId: c.companyId })}
              >
                <Building2 className="w-4 h-4 mr-2" /> {c.label}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {workspaces.delegated.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              On behalf of
            </DropdownMenuLabel>
            {workspaces.delegated.map((d) => (
              <DropdownMenuItem
                key={d.subjectUserId}
                onClick={() =>
                  setSelection({ kind: "delegated", subjectUserId: d.subjectUserId })
                }
              >
                <UserRound className="w-4 h-4 mr-2" /> {d.label}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function labelFor(
  s: WorkspaceSelection,
  workspaces: NonNullable<ReturnType<typeof useWorkspace>["workspaces"]>,
): string {
  if (s.kind === "personal") return workspaces.personal.label;
  if (s.kind === "company") {
    return workspaces.companies.find((c) => c.companyId === s.companyId)?.label ?? "Company";
  }
  return (
    workspaces.delegated.find((d) => d.subjectUserId === s.subjectUserId)?.label ?? "Delegate"
  );
}

function iconFor(s: WorkspaceSelection) {
  if (s.kind === "company") return Building2;
  if (s.kind === "delegated") return UserRound;
  return User;
}
