import { Eye, Edit, Film, Copy, Star, Share2, Trash2, MoreHorizontal, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ResumeActionsMenuProps {
  isOwner?: boolean;
  isActive?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onAddMedia?: () => void;
  onCreateVariation?: () => void;
  onSetActive?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  /** For tracked (non-owned) resumes — shows Track/Untrack instead of owner actions */
  isTracked?: boolean;
  onTrack?: () => void;
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
  onView,
  onEdit,
  onAddMedia,
  onCreateVariation,
  onSetActive,
  onShare,
  onDelete,
  triggerClassName,
  isTracked = false,
  onTrack,
  triggerVariant = "ghost",
  align = "end",
}: ResumeActionsMenuProps) {
  const hasOwnerActions = isOwner && (onEdit || onAddMedia || onCreateVariation || (!isActive && onSetActive) || onDelete);
  const hasPublicActions = onView || onShare || onTrack;

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
          <span className="sr-only">Resume actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {/* Public actions (visible to all) */}
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

        {/* Share (visible to all) */}
        {onShare && (
          <>
            {(onView || (isOwner && (onEdit || onAddMedia || onCreateVariation || onSetActive))) && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem onClick={onShare}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </DropdownMenuItem>
          </>
        )}

        {/* Track/Untrack — for non-owned tracked resumes */}
        {!isOwner && onTrack && (
          <DropdownMenuItem onClick={onTrack}>
            {isTracked
              ? <><BookmarkCheck className="w-4 h-4 mr-2" />Untrack Resume</>
              : <><Bookmark className="w-4 h-4 mr-2" />Track Resume</>}
          </DropdownMenuItem>
        )}

        {/* Delete — owner only, always at the bottom with separator */}
        {isOwner && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Resume
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
