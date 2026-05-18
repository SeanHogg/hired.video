// EntityCloneItem — the "Clone" (a.k.a. "Duplicate" / "Copy") dropdown row
// shared by every owner-action menu (resume, job, company, course, project).
//
// Self-gating per the standing DRY rule:
//   - returns null when the viewer doesn't own the entity (no clone affordance
//     for non-owners — they'd just get a 403)
//   - returns null when no `onClone` handler is wired up
//   - parents pass the entity-specific label ("Clone Job", "Clone Resume",
//     etc.) so no entity-specific branching leaks into this component
//
// The clone copy convention is platform-wide: the backend appends "(Copy)"
// to the title and regenerates any slug, so consumers only need to fire the
// handler — no extra prompts, no extra wiring.

import { Copy } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export interface EntityCloneItemProps {
  isOwner?: boolean;
  onClone?: () => void;
  /** Label shown on the row. Defaults to "Clone". */
  label?: string;
}

export function EntityCloneItem({
  isOwner = false,
  onClone,
  label = "Clone",
}: EntityCloneItemProps): JSX.Element | null {
  if (!isOwner || !onClone) return null;
  return (
    <DropdownMenuItem onClick={onClone}>
      <Copy className="w-4 h-4 mr-2" />
      {label}
    </DropdownMenuItem>
  );
}
