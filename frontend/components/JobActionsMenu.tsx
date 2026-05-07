// JobActionsMenu — the (⋯) overflow menu for a job card / detail page.
// Mirrors `ResumeActionsMenu` so the two surfaces stay consistent: every
// owner gets the same Edit / Run Tool / Tool History / Analytics / Share /
// Delete cluster, every viewer gets the same Share / Copy Link / QR /
// Embed cluster, every non-owner gets Track / Untrack.
//
// Self-gating per the standing DRY rule — the menu only renders items for
// the callbacks the caller provides; the share cluster comes from the
// shared `EntityShareGroup` (used by both Resume and Job menus).

import {
  Eye, Edit, Trash2, MoreHorizontal, Bookmark, BookmarkCheck, Mail,
  History, BarChart3, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolsSubmenu } from "@/components/ToolsSubmenu";
import { EntityShareGroup } from "@/components/EntityShareGroup";
import CreateVideoMenuItem from "@/components/studio/CreateVideoMenuItem";

interface JobActionsMenuProps {
  /** Job id — required for the Run Tool deep-link and the Create Video chip. */
  jobId?: string;
  isOwner?: boolean;
  /** Tracked-by-me state — drives Track / Untrack label on non-owner views. */
  isTracked?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onRename?: () => void;
  onShare?: () => void;
  onCopyLink?: () => void;
  onShowQR?: () => void;
  onEmbed?: () => void;
  onViewToolHistory?: () => void;
  onViewAnalytics?: () => void;
  onTrack?: () => void;
  onContactOwner?: () => void;
  onDelete?: () => void;
  /** Extra dropdown items appended to the menu (e.g. AddToListMenu). */
  extraMenuItems?: React.ReactNode;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "secondary" | "outline";
  align?: "start" | "center" | "end";
}

export function JobActionsMenu({
  jobId,
  isOwner = false,
  isTracked = false,
  onView,
  onEdit,
  onRename,
  onShare,
  onCopyLink,
  onShowQR,
  onEmbed,
  onViewToolHistory,
  onViewAnalytics,
  onTrack,
  onContactOwner,
  onDelete,
  extraMenuItems,
  triggerClassName,
  triggerVariant = "ghost",
  align = "end",
}: JobActionsMenuProps): JSX.Element | null {
  const showRunTool = isOwner && !!jobId;
  const hasOwnerActions =
    isOwner &&
    (onEdit || onRename || onDelete || showRunTool || onViewToolHistory || onViewAnalytics);
  const hasPublicActions =
    onView || onShare || onCopyLink || onShowQR || onEmbed || onTrack || onContactOwner;

  if (!hasOwnerActions && !hasPublicActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={triggerVariant}
          size="sm"
          className={triggerClassName ?? "h-8 w-8 p-0"}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Job actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {/* View — visible to all */}
        {onView && (
          <DropdownMenuItem onClick={onView}>
            <Eye className="w-4 h-4 mr-2" />
            View Job
          </DropdownMenuItem>
        )}

        {/* Owner-only actions */}
        {isOwner && onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Job
          </DropdownMenuItem>
        )}
        {isOwner && onRename && (
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
        )}
        {/* Studio deep-link — owner only since the wizard expects the
            user's own subject content. */}
        {isOwner && jobId && (
          <CreateVideoMenuItem subject={{ kind: "job", id: jobId }} />
        )}

        {/* Run Tool submenu + Tool Run History — owner only. */}
        {isOwner && (showRunTool || onViewToolHistory) && (
          <DropdownMenuSeparator />
        )}
        {showRunTool && <ToolsSubmenu entityType="job" entityId={jobId!} />}
        {isOwner && onViewToolHistory && (
          <DropdownMenuItem onClick={onViewToolHistory}>
            <History className="w-4 h-4 mr-2" />
            Tool Run History
          </DropdownMenuItem>
        )}
        {isOwner && onViewAnalytics && (
          <DropdownMenuItem onClick={onViewAnalytics}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </DropdownMenuItem>
        )}

        {/* Share group — visible to all. Self-gates. */}
        <EntityShareGroup
          onShare={onShare}
          onCopyLink={onCopyLink}
          onShowQR={onShowQR}
          onEmbed={onEmbed}
          withSeparator={Boolean(onView || hasOwnerActions)}
        />

        {/* Non-owner: Track / Untrack & Contact Owner */}
        {!isOwner && onTrack && (
          <DropdownMenuItem onClick={onTrack}>
            {isTracked
              ? <><BookmarkCheck className="w-4 h-4 mr-2" />Unsave Job</>
              : <><Bookmark className="w-4 h-4 mr-2" />Save Job</>}
          </DropdownMenuItem>
        )}
        {!isOwner && onContactOwner && (
          <DropdownMenuItem onClick={onContactOwner}>
            <Mail className="w-4 h-4 mr-2" />
            Contact Recruiter
          </DropdownMenuItem>
        )}

        {/* Caller-supplied extras (e.g. AddToListMenu). Sits before Delete
            so the destructive item stays the last entry in the menu. */}
        {extraMenuItems}

        {/* Delete — owner only, always at the bottom with separator */}
        {isOwner && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Job
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
