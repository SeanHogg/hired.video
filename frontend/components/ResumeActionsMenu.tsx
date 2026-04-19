import {
  Eye, Edit, Film, Copy, Star, Share2, Trash2, MoreHorizontal,
  Bookmark, BookmarkCheck, Download, Globe, Users, Lock, UserPlus, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResumePrivacy } from "@/types/resume";
import { ToolsSubmenu } from "@/components/ToolsSubmenu";

interface ResumeActionsMenuProps {
  isOwner?: boolean;
  isActive?: boolean;
  isMaster?: boolean;
  parentId?: string;
  onView?: () => void;
  onEdit?: () => void;
  onAddMedia?: () => void;
  onCreateVariation?: () => void;
  onSetActive?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  onChangePrivacy?: (privacy: ResumePrivacy) => void;
  onPromoteToMaster?: () => void;
  onDelete?: () => void;
  /** For tracked (non-owned) resumes — shows Track/Untrack instead of owner actions */
  isTracked?: boolean;
  onTrack?: () => void;
  /** Contact resume owner — for non-owners (recruiters / business owners) */
  onContactOwner?: () => void;
  /** Called when the user picks a tool from the "Run Tool" submenu. Receives the tool id from the resume-tool registry. */
  onRunTool?: (toolId: string) => void;
  /** Pass a className to override the trigger button style (e.g. for hero header on detail page) */
  triggerClassName?: string;
  /** Button variant for the trigger */
  triggerVariant?: "ghost" | "secondary" | "outline";
  align?: "start" | "center" | "end";
}

/**
 * Reusable resume actions (⋯) dropdown.
 * Items are rendered based on what callbacks are provided and whether the
 * viewer is the owner of the resume.
 */
export function ResumeActionsMenu({
  isOwner = false,
  isActive = false,
  isMaster = false,
  parentId,
  onView,
  onEdit,
  onAddMedia,
  onCreateVariation,
  onSetActive,
  onShare,
  onDownload,
  onChangePrivacy,
  onPromoteToMaster,
  onDelete,
  triggerClassName,
  isTracked = false,
  onTrack,
  onContactOwner,
  onRunTool,
  triggerVariant = "ghost",
  align = "end",
}: ResumeActionsMenuProps) {
  const hasOwnerActions = isOwner && (onEdit || onAddMedia || onCreateVariation || (!isActive && onSetActive) || onDownload || onChangePrivacy || onPromoteToMaster || onDelete || onRunTool);
  const hasPublicActions = onView || onShare || onTrack || onContactOwner;

  if (!hasOwnerActions && !hasPublicActions) return null;

  const deleteLabel = parentId ? "Delete Variation" : "Delete Resume";
  const showPromote = isOwner && onPromoteToMaster && (!isMaster || parentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={triggerVariant}
          size="sm"
          className={triggerClassName ?? "h-8 w-8 p-0"}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Resume actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {/* View — visible to all */}
        {onView && (
          <DropdownMenuItem onClick={onView}>
            <Eye className="w-4 h-4 mr-2" />
            View Resume
          </DropdownMenuItem>
        )}

        {/* Owner-only actions */}
        {isOwner && onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Resume
          </DropdownMenuItem>
        )}
        {isOwner && onAddMedia && (
          <DropdownMenuItem onClick={onAddMedia}>
            <Film className="w-4 h-4 mr-2" />
            Add Media
          </DropdownMenuItem>
        )}
        {isOwner && onCreateVariation && (
          <DropdownMenuItem onClick={onCreateVariation}>
            <Copy className="w-4 h-4 mr-2" />
            Create Variation
          </DropdownMenuItem>
        )}
        {isOwner && !isActive && onSetActive && (
          <DropdownMenuItem onClick={onSetActive}>
            <Star className="w-4 h-4 mr-2" />
            Set as Active
          </DropdownMenuItem>
        )}
        {isOwner && onDownload && (
          <DropdownMenuItem onClick={onDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </DropdownMenuItem>
        )}

        {/* Run Tool submenu — owner only. Filtered from the global tool registry. */}
        {isOwner && onRunTool && (
          <>
            <DropdownMenuSeparator />
            <ToolsSubmenu entityType="resume" onRunTool={onRunTool} />
          </>
        )}

        {/* Privacy submenu — owner only */}
        {isOwner && onChangePrivacy && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe className="w-4 h-4 mr-2" />
                Change Privacy
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => onChangePrivacy("public")}>
                  <Globe className="w-4 h-4 mr-2" />
                  Make Public
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onChangePrivacy("recruiter_only")}>
                  <Users className="w-4 h-4 mr-2" />
                  Recruiters Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onChangePrivacy("connections")}>
                  <Users className="w-4 h-4 mr-2" />
                  Connections
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onChangePrivacy("private")}>
                  <Lock className="w-4 h-4 mr-2" />
                  Make Private
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {/* Promote to Master — owner only, when not already master */}
        {showPromote && (
          <DropdownMenuItem onClick={onPromoteToMaster}>
            <UserPlus className="w-4 h-4 mr-2" />
            Promote to Master
          </DropdownMenuItem>
        )}

        {/* Share — visible to all */}
        {onShare && (
          <>
            {(onView || hasOwnerActions) && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem onClick={onShare}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </DropdownMenuItem>
          </>
        )}

        {/* Non-owner actions: Track/Untrack & Contact Owner */}
        {!isOwner && onTrack && (
          <DropdownMenuItem onClick={onTrack}>
            {isTracked
              ? <><BookmarkCheck className="w-4 h-4 mr-2" />Untrack Resume</>
              : <><Bookmark className="w-4 h-4 mr-2" />Track Resume</>}
          </DropdownMenuItem>
        )}
        {!isOwner && onContactOwner && (
          <DropdownMenuItem onClick={onContactOwner}>
            <Mail className="w-4 h-4 mr-2" />
            Contact Owner
          </DropdownMenuItem>
        )}

        {/* Delete — owner only, always at the bottom with separator */}
        {isOwner && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
