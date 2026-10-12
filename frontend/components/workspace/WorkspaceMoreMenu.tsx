/**
 * WorkspaceMoreMenu — the header's ⋯. Its rows come from the registry
 * (MORE_ITEMS: Details, Download PDF, Save as…, Versions); the host binds
 * the ones its document supports — an unbound row is not shown, a bound row
 * can be `disabled`. A format's own section (the studio's export / share /
 * publish rows) goes in `children`, after them. Advanced's rows (Editing /
 * Reviewing, Embed, Invite) are appended at the very end.
 *
 * `phoneItems` are the header buttons that fold into ⋯ below `sm` (Undo,
 * Redo, Preview, Simple | Advanced) so the phone header stays one row.
 *
 * Dialogs opened from a row must render OUTSIDE the dropdown (Radix unmounts
 * the content on close) — pass them as `dialogs`.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moreItemsFor, type MoreItemDef, type MoreItemId } from "@/lib/workspace/workspace-panels";
import type { WorkspaceDepth } from "@/lib/workspace/workspace-depth";

export interface MoreAction {
  onSelect: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Overrides the registry label (already translated). */
  label?: string;
}

interface WorkspaceMoreMenuProps {
  depth: WorkspaceDepth;
  actions: Partial<Record<MoreItemId, MoreAction | null>>;
  /** Rows folded in from the header below the wide layout (null when wide). */
  phoneItems?: ReactNode | null;
  /** The format's own rows, after the registry rows. */
  children?: ReactNode;
  dialogs?: ReactNode;
}

export default function WorkspaceMoreMenu({ depth, actions, phoneItems, children, dialogs }: WorkspaceMoreMenuProps) {
  const { t } = useTranslation();
  const rows = moreItemsFor(depth).filter((item) => actions[item.id]);
  const simple = rows.filter((item) => item.depth === "simple");
  const advanced = rows.filter((item) => item.depth === "advanced");
  const row = (item: MoreItemDef) => {
    const action = actions[item.id];
    if (!action) return null;
    const Icon = item.icon;
    return (
      <DropdownMenuItem key={item.id} onSelect={action.onSelect} disabled={action.disabled || action.busy} className="cursor-pointer">
        {action.busy ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        )}
        {action.label ?? t(item.labelKey)}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("workspace.more.label")}
            title={t("workspace.more.label")}
            className="h-11 w-11 flex-none rounded-[9px] border-input"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[75dvh] w-64 overflow-y-auto">
          {phoneItems && (
            <>
              {phoneItems}
              <DropdownMenuSeparator />
            </>
          )}
          {simple.map(row)}
          {children && (
            <>
              {simple.length > 0 && <DropdownMenuSeparator />}
              {children}
            </>
          )}
          {/* Advanced appends at the END — nothing above it moves. */}
          {advanced.length > 0 && (
            <>
              {(simple.length > 0 || children) && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("workspace.depth.advanced")}
              </DropdownMenuLabel>
              {advanced.map(row)}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
