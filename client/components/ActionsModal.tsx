import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Eye, 
  Share2, 
  Edit, 
  Download, 
  Trash2, 
  UserPlus,
  X
} from "lucide-react";

interface User {
  id: string;
  isAuthenticated: boolean;
  role: 'job_seeker' | 'recruiter' | 'business';
}

interface ContentItem {
  id: string;
  ownerId?: string;
  type: 'resume' | 'job_description';
  contentType: 'video' | 'text';
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
}: ActionsModalProps) {
  const isOwner = user?.isAuthenticated && item && user.id === item.ownerId;
  const isRecruiter = user?.isAuthenticated && user.role === 'recruiter';
  const isAuthenticated = user?.isAuthenticated;

  const getAvailableActions = () => {
    const actions = [];

    // View - available to everyone
    actions.push({
      id: 'view',
      label: 'View',
      icon: Eye,
      onClick: () => {
        onView?.();
        onClose();
      },
      variant: 'outline' as const,
    });

    // Share - available to everyone
    actions.push({
      id: 'share',
      label: 'Share',
      icon: Share2,
      onClick: () => {
        onShare?.();
        onClose();
      },
      variant: 'default' as const,
    });

    // Owner actions
    if (isOwner) {
      actions.push({
        id: 'edit',
        label: 'Edit',
        icon: Edit,
        onClick: () => {
          onEdit?.();
          onClose();
        },
        variant: 'outline' as const,
      });

      actions.push({
        id: 'download',
        label: 'Download',
        icon: Download,
        onClick: () => {
          onDownload?.();
          onClose();
        },
        variant: 'outline' as const,
      });

      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => {
          onDelete?.();
          onClose();
        },
        variant: 'destructive' as const,
      });
    }

    // Recruiter actions (for resumes they don't own)
    if (isRecruiter && !isOwner && item && item.type === 'resume') {
      actions.push({
        id: 'download',
        label: 'Download Resume',
        icon: Download,
        onClick: () => {
          onDownload?.();
          onClose();
        },
        variant: 'outline' as const,
      });

      actions.push({
        id: 'track',
        label: 'Track Candidate',
        icon: UserPlus,
        onClick: () => {
          onTrack?.();
          onClose();
        },
        variant: 'default' as const,
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
          {actions.map((action) => (
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
              <strong>Sign in</strong> to access more actions like downloading and tracking candidates.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
