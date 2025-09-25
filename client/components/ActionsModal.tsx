import { Eye, Share2, Edit, Download, Trash2, UserPlus, X, Globe, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, USER_ROLES } from "@/lib/auth";
import type { ResumePrivacy } from "@/types/resume";
import type { ComponentType } from "react";

interface ContentItem {
  id: string;
  ownerId?: string;
  type: "resume" | "job_description";
  contentType: "video" | "text";
}

type ActionVariant = "outline" | "default" | "destructive";
interface ModalAction {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  variant: ActionVariant;
}

interface ActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ContentItem;
  user: User | null;
  onView?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onTrack?: () => void;
  onChangePrivacy?: (privacy: ResumePrivacy) => void;
  onPromoteToMaster?: () => void;
}

export default function ActionsModal({
  isOpen,
  onClose,
  item,
  user,
  onView,
  onShare,
  onEdit,
  onDownload,
  onDelete,
  onTrack,
  onChangePrivacy,
  onPromoteToMaster,
}: ActionsModalProps) {
  // Early return if modal is not open or item is null
  if (!isOpen || !item) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Actions</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const effectiveOwnerId = (item as any)?.ownerId ?? (item as any)?.userId;
  const isOwner = Boolean(user && effectiveOwnerId && user.id === effectiveOwnerId);
  const isRecruiter = user && user.role === USER_ROLES.RECRUITER;
  const isAuthenticated = !!user;

  const getAvailableActions = (): ModalAction[] => {
    const actions: Array<{ id: string; label: string; icon: any; onClick: () => void; variant: "outline" | "default" | "destructive" }>= [];

    // View - available to everyone
    actions.push({
      id: "view",
      label: "View",
      icon: Eye,
      onClick: () => {
        onView?.();
        onClose();
      },
      variant: "outline",
    });

    // Share - available to everyone
    actions.push({
      id: "share",
      label: "Share",
      icon: Share2,
      onClick: () => {
        onShare?.();
        onClose();
      },
      variant: "default",
    });

    // Owner actions
    if (isOwner) {
      actions.push({
        id: "edit",
        label: "Edit",
        icon: Edit,
        onClick: () => {
          onEdit?.();
          onClose();
        },
        variant: "outline",
      });

      actions.push({
        id: "download",
        label: "Download",
        icon: Download,
        onClick: () => {
          onDownload?.();
          onClose();
        },
        variant: "outline",
      });

      // Privacy options group
      actions.push({ id: "separator-privacy", label: "", icon: () => null, onClick: () => {}, variant: "outline" });

      actions.push({
        id: "privacy-public",
        label: "Make Public",
        icon: Globe,
        onClick: () => {
          onChangePrivacy?.("public");
          onClose();
        },
        variant: "outline",
      });
      actions.push({
        id: "privacy-recruiter",
        label: "Recruiters Only",
        icon: Users,
        onClick: () => {
          onChangePrivacy?.("recruiter_only");
          onClose();
        },
        variant: "outline",
      });
      actions.push({
        id: "privacy-connections",
        label: "Connections",
        icon: Users,
        onClick: () => {
          onChangePrivacy?.("connections");
          onClose();
        },
        variant: "outline",
      });
      actions.push({
        id: "privacy-private",
        label: "Make Private",
        icon: Lock,
        onClick: () => {
          onChangePrivacy?.("private");
          onClose();
        },
        variant: "outline",
      });

      // Promote/Convert to master when the resume is not a master yet (covers variants and orphans)
      if ((item as any)?.type === "resume" && (((item as any)?.isMaster === false) || (item as any)?.parentId)) {
        actions.push({
          id: "promote",
          label: "Promote to Master",
          icon: UserPlus,
          onClick: () => {
            onPromoteToMaster?.();
            onClose();
          },
          variant: "outline",
        });
      }

      actions.push({
        id: "delete",
        label: "Delete",
        icon: Trash2,
        onClick: () => {
          onDelete?.();
          onClose();
        },
        variant: "destructive",
      });
    }

    // Recruiter actions (for resumes they don't own)
    if (isRecruiter && !isOwner && item && item.type === "resume") {
      actions.push({
        id: "download",
        label: "Download Resume",
        icon: Download,
        onClick: () => {
          onDownload?.();
          onClose();
        },
        variant: "outline",
      });

      actions.push({
        id: "track",
        label: "Track Candidate",
        icon: UserPlus,
        onClick: () => {
          onTrack?.();
          onClose();
        },
        variant: "default",
      });
    }

    return actions;
  };

  const actions = getAvailableActions();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">Actions</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3 pt-4">
          {actions.filter(a => !a.id.startsWith("separator")).map((action) => (
            <Button
              key={action.id}
              variant={action.variant}
              onClick={action.onClick}
              className="w-full justify-start gap-3 h-12"
              size="lg"
            >
              <action.icon className="h-5 w-5" />
              {action.label}
            </Button>
          ))}
        </div>

        {!isAuthenticated && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              <strong>Sign in</strong> to access more actions like downloading
              and tracking candidates.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
