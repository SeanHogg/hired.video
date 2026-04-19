import {
  Eye, Edit, Film, Copy, Star, Share2, Trash2, MoreHorizontal,
  Bookmark, BookmarkCheck, Download, Globe, Users, Lock, UserPlus, Mail,
  History, GitMerge, Code2, FileJson, FileType, Printer, FileText,
  Pencil, Link2, QrCode, BarChart3,
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
import type { ResumeDownloadFormat } from "@/lib/analytics/resume-tracker";
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
   * Called when the user picks an export format from the "Export" submenu.
   * The parent is responsible for running the export and recording the
   * download metric. Formats kept in sync with the viewer's Export button.
   */
  onDownload?: (format: ResumeDownloadFormat) => void;
  /** Rename the resume title — opens a rename dialog. Owner only. */
  onRename?: () => void;
  /** Copy the resume's public URL to clipboard. All viewers. */
  onCopyLink?: () => void;
  /** Show QR code for the resume URL (in-person networking). All viewers. */
  onShowQR?: () => void;
  /** View resume analytics (views, downloads, per-viewer breakdown). Owner only. */
  onViewAnalytics?: () => void;
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
  onRename,
  onAddMedia,
  onCreateVariation,
  onSetActive,
  onShare,
  onCopyLink,
  onShowQR,
  onEmbed,
  onDownload,
  onChangePrivacy,
  onPromoteToMaster,
  onCopyToMaster,
  onDelete,
  onViewAnalytics,
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
  const hasOwnerActions = isOwner && (onEdit || onRename || onAddMedia || onCreateVariation || (!isActive && onSetActive) || onDownload || onChangePrivacy || onPromoteToMaster || showCopyToMaster || onDelete || onRunTool || onViewToolHistory || onViewAnalytics);
  const hasPublicActions = onView || onShare || onCopyLink || onShowQR || onEmbed || onTrack || onContactOwner;

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
        {isOwner && onRename && (
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="w-4 h-4 mr-2" />
            Rename
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
              Export
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDownload("text")}>
                <FileText className="w-4 h-4 mr-2" />
                Plain Text (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload("json")}>
                <FileJson className="w-4 h-4 mr-2" />
                Raw JSON (.json)
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
        {isOwner && onViewAnalytics && (
          <DropdownMenuItem onClick={onViewAnalytics}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
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

        {/* Share group — visible to all. One leading separator, then Share / Copy Link / QR Code / Embed. */}
        {(onShare || onCopyLink || onShowQR || onEmbed) && (onView || hasOwnerActions) && (
          <DropdownMenuSeparator />
        )}
        {onShare && (
          <DropdownMenuItem onClick={onShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </DropdownMenuItem>
        )}
        {onCopyLink && (
          <DropdownMenuItem onClick={onCopyLink}>
            <Link2 className="w-4 h-4 mr-2" />
            Copy Link
          </DropdownMenuItem>
        )}
        {onShowQR && (
          <DropdownMenuItem onClick={onShowQR}>
            <QrCode className="w-4 h-4 mr-2" />
            QR Code
          </DropdownMenuItem>
        )}
        {onEmbed && (
          <DropdownMenuItem onClick={onEmbed}>
            <Code2 className="w-4 h-4 mr-2" />
            Embed
          </DropdownMenuItem>
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
