import {
  Eye, Edit, Film, Copy, Star, Trash2, MoreHorizontal,
  Download, Globe, Users, Lock, UserPlus, Mail,
  History, GitMerge, FileJson, FileType, Printer, FileText,
  Pencil, BarChart3, Archive, ArchiveRestore,
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
import { EntityShareGroup } from "@/components/EntityShareGroup";
import { EntityTrackItem } from "@/components/EntityTrackItem";
import { EntityCloneItem } from "@/components/EntityCloneItem";
import CreateVideoMenuItem from "@/components/studio/CreateVideoMenuItem";

interface ResumeActionsMenuProps {
  /** Resume id — forwarded to the Run-Tool submenu so deep-links carry
   *  `?resumeId=…` to the tool page. Required for the "Run Tool" entry
   *  to render; if absent, the submenu is hidden. */
  resumeId?: string;
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
  /** Owner-only — `POST /api/resumes/:id/clone`. Backend appends " (copy)"
   *  to title and lands the clone as `status: draft`. Distinct from
   *  `onCreateVariation` (which links the new row to this one as a
   *  parent/variant); Clone produces an independent copy. */
  onClone?: () => void;
  onDelete?: () => void;
  /** #154 — Archive / Unarchive. Soft-delete that preserves slug + analytics.
   *  The menu shows "Archive Resume" when `isArchived` is falsy and
   *  "Restore from Archive" when true. Owner only. */
  isArchived?: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  /** #155 — Open version history dialog. Owner only. */
  onViewVersionHistory?: () => void;
  /** For tracked (non-owned) resumes — shows Track/Untrack instead of owner actions */
  isTracked?: boolean;
  onTrack?: () => void;
  /** Contact resume owner — for non-owners (recruiters / business owners) */
  onContactOwner?: () => void;
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
  resumeId,
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
  onClone,
  onDelete,
  isArchived = false,
  onArchive,
  onUnarchive,
  onViewVersionHistory,
  onViewAnalytics,
  triggerClassName,
  isTracked = false,
  onTrack,
  onContactOwner,
  onViewToolHistory,
  triggerVariant = "ghost",
  align = "end",
}: ResumeActionsMenuProps) {
  const showCopyToMaster = isOwner && !!onCopyToMaster && !!parentId;
  const showRunTool = isOwner && !!resumeId;
  const showArchive = isOwner && ((isArchived && !!onUnarchive) || (!isArchived && !!onArchive));
  const showVersionHistory = isOwner && !!onViewVersionHistory;
  const hasOwnerActions = isOwner && (onEdit || onRename || onAddMedia || onCreateVariation || (!isActive && onSetActive) || onDownload || onChangePrivacy || onPromoteToMaster || showCopyToMaster || onClone || showArchive || showVersionHistory || onDelete || showRunTool || onViewToolHistory || onViewAnalytics);
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
        {/* Clone — owner only. Distinct from "Create Variation" (parent/child
            link). Self-gates on isOwner + onClone presence. */}
        <EntityCloneItem isOwner={isOwner} onClone={onClone} label="Clone Resume" />
        {/* Studio deep-link (#270) — owner-only since the wizard requires
            login + the user's own subject content. CreateVideoMenuItem
            owns the URL formatting + label so every entity menu reads
            consistently. */}
        {isOwner && resumeId && (
          <CreateVideoMenuItem subject={{ kind: "resume", id: resumeId }} />
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

        {/* Run Tool submenu + Tool Run History — owner only. The submenu
            sources entries from the public tools catalog and deep-links
            each tool with the resume id so the destination page can
            preselect this resume. */}
        {isOwner && (showRunTool || onViewToolHistory) && (
          <DropdownMenuSeparator />
        )}
        {showRunTool && (
          <ToolsSubmenu entityType="resume" entityId={resumeId!} />
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

        {/* Share group — visible to all. Self-gates. */}
        <EntityShareGroup
          onShare={onShare}
          onCopyLink={onCopyLink}
          onShowQR={onShowQR}
          onEmbed={onEmbed}
          withSeparator={Boolean(onView || hasOwnerActions)}
        />

        {/* Non-owner actions: Track/Untrack & Contact Owner.
            EntityTrackItem self-gates on `useAuth().isAuthenticated` so
            unauthenticated viewers never see Track — they get the Share
            group only. */}
        <EntityTrackItem
          isOwner={isOwner}
          isTracked={isTracked}
          onTrack={onTrack}
          trackLabel="Track Resume"
          trackedLabel="Untrack Resume"
        />
        {!isOwner && onContactOwner && (
          <DropdownMenuItem onClick={onContactOwner}>
            <Mail className="w-4 h-4 mr-2" />
            Contact Owner
          </DropdownMenuItem>
        )}

        {/* #155 — Version History. Owner only. Opens the dialog
            mounted by the parent page. Sits above Archive so the
            destructive group stays at the bottom. */}
        {showVersionHistory && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onViewVersionHistory}>
              <History className="w-4 h-4 mr-2" />
              Version History
            </DropdownMenuItem>
          </>
        )}

        {/* #154 — Archive / Unarchive. Owner only. Soft-delete that
            preserves slug + analytics history. Label flips on
            `isArchived`. */}
        {showArchive && (
          <DropdownMenuItem onClick={isArchived ? onUnarchive : onArchive}>
            {isArchived ? (
              <>
                <ArchiveRestore className="w-4 h-4 mr-2" />
                Restore from Archive
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 mr-2" />
                Archive Resume
              </>
            )}
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
