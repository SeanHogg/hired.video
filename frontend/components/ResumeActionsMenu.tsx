import {
  Eye, Edit, Film, Copy, Star, Share2, Trash2, MoreHorizontal,
  Bookmark, BookmarkCheck, Download, Globe, Users, Lock, UserPlus, Mail,
  History, GitMerge, Code2, FileJson, FileType, Printer,
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
  onEmbed?: () => void;
  /**
   * Called when the user picks a download format from the "Download" submenu.
   * Receives one of "pdf" | "word" | "json". The parent is responsible for
   * running the export and recording the download metric.
   */
  onDownload?: (format: "pdf" | "word" | "json") => void;
  onChangePrivacy?: (privacy: ResumePrivacy) => void;
  onPromoteToMaster?: () => void;
  /**
   * Merge this variant's content back up into its parent. Only shown on
   * resumes that have a parent (i.e. variants) — this is the "keep the
   * primary resume rich" flow the user asked for.
   */
  onCopyToMaster?: () => void;
  onDelete?: () => void;
  /** For tracked (non-owned) resumes — shows Track/Untrack instead of owner actions */
  isTracked?: boolean;
  onTrack?: () => void;
  /** Contact resume owner — for non-owners (recruiters / business owners) */
  onContactOwner?: () => void;
  /** Called when the user picks a tool from the "Run Tool" submenu. Receives the tool id from the resume-tool registry. */
  onRunTool?: (toolId: string) => void;
  /** Called when the user picks "Tool Run History". Should open the history side panel for this resume. */
  onViewToolHistory?: () => void;
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
  onEmbed,
  onDownload,
  onChangePrivacy,
  onPromoteToMaster,
  onCopyToMaster,
  onDelete,
  triggerClassName,
  isTracked = false,
  onTrack,
  onContactOwner,
  onRunTool,
  onViewToolHistory,
  triggerVariant = "ghost",
  align = "end",
}: ResumeActionsMenuProps) {
  const showCopyToMaster = isOwner && !!onCopyToMaster && !!parentId;
  const hasOwnerActions = isOwner && (onEdit || onAddMedia || onCreateVariation || (!isActive && onSetActive) || onDownload || onChangePrivacy || onPromoteToMaster || showCopyToMaster || onDelete || onRunTool || onViewToolHistory);
  const hasPublicActions = onView || onShare || onEmbed || onTrack || onContactOwner;

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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="w-4 h-4 mr-2" />
              Download
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => onDownload("pdf")}>
                <Printer className="w-4 h-4 mr-2" />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload("word")}>
                <FileType className="w-4 h-4 mr-2" />
                Word (.doc)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload("json")}>
                <FileJson className="w-4 h-4 mr-2" />
                JSON
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Run Tool submenu + Tool Run History — owner only. Filtered from the global tool registry. */}
        {isOwner && (onRunTool || onViewToolHistory) && (
          <DropdownMenuSeparator />
        )}
        {isOwner && onRunTool && (
          <ToolsSubmenu entityType="resume" onRunTool={onRunTool} />
        )}
        {isOwner && onViewToolHistory && (
          <DropdownMenuItem onClick={onViewToolHistory}>
            <History className="w-4 h-4 mr-2" />
            Tool Run History
          </DropdownMenuItem>
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

        {/* Copy child content back into its parent — variants only */}
        {showCopyToMaster && (
          <DropdownMenuItem onClick={onCopyToMaster}>
            <GitMerge className="w-4 h-4 mr-2" />
            Copy to Master
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
        {onEmbed && (
          <>
            {!onShare && (onView || hasOwnerActions) && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem onClick={onEmbed}>
              <Code2 className="w-4 h-4 mr-2" />
              Embed
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
