import {
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  Clock,
  FileText,
  MessageCircle,
  MoreVertical,
  Share,
  UserCog,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AddToListMenu from "@/components/lists/AddToListMenu";

export type ConnectionState = "none" | "pending_sent" | "pending_received" | "connected";

interface VisitorActionsSectionProps {
  /** Whether the viewer is authenticated. Unauthenticated viewers see nothing
   *  here — the AuthOverlay covers the page. */
  isAuthenticated: boolean;
  /** Connection state between the viewer and the profile owner. */
  connectionState: ConnectionState;
  /** Whether a connection mutation is in-flight — locks all buttons. */
  busy: boolean;
  /** Whether this visitor is a recruiter, enabling the Actions dropdown. */
  isRecruiter: boolean;
  /** Whether this visitor is an employer. Employers also get the Actions
   *  dropdown (with Add-to-list) but not the talent-pool action. */
  isEmployer?: boolean;
  /** Whether the profile owner is already in the recruiter's talent pool. */
  inTalentPool: boolean;
  talentPoolBusy: boolean;
  /** Whether the viewer is already following/tracking this profile. */
  isTracked: boolean;
  /** The profile owner's id + display name — needed by AddToListMenu. */
  personId: string;
  personName?: string;

  onConnect: () => void;
  onAcceptConnection: () => void;
  onRejectConnection: () => void;
  onCancelConnectionRequest: () => void;
  onDisconnect: () => void;
  onMessage: () => void;
  onTrack: () => void;
  onShare: () => void;
  onAddToTalentPool: () => void;
  onSubmitToJob: () => void;
}

export default function VisitorActionsSection({
  isAuthenticated,
  connectionState,
  busy,
  isRecruiter,
  isEmployer = false,
  inTalentPool,
  talentPoolBusy,
  isTracked,
  personId,
  personName,
  onConnect,
  onAcceptConnection,
  onRejectConnection,
  onCancelConnectionRequest,
  onDisconnect,
  onMessage,
  onTrack,
  onShare,
  onAddToTalentPool,
  onSubmitToJob,
}: VisitorActionsSectionProps) {
  if (!isAuthenticated) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <ConnectionControls
        state={connectionState}
        busy={busy}
        onConnect={onConnect}
        onAccept={onAcceptConnection}
        onReject={onRejectConnection}
        onCancel={onCancelConnectionRequest}
        onDisconnect={onDisconnect}
        onMessage={onMessage}
      />

      <Button variant="outline" onClick={onTrack}>
        {isTracked ? (
          <>
            <BookmarkCheck className="h-4 w-4 mr-2" />
            Following
          </>
        ) : (
          <>
            <Bookmark className="h-4 w-4 mr-2" />
            Follow
          </>
        )}
      </Button>

      <Button variant="outline" size="icon" onClick={onShare} aria-label="Share profile">
        <Share className="h-4 w-4" />
      </Button>

      {(isRecruiter || isEmployer) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default">
              <MoreVertical className="h-4 w-4 mr-2" />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isRecruiter && (
              <>
                <DropdownMenuItem
                  onClick={onAddToTalentPool}
                  disabled={inTalentPool || talentPoolBusy}
                >
                  <UserCog className="h-4 w-4 mr-2" />
                  {inTalentPool ? "In Talent Pool" : "Add to Talent Pool"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSubmitToJob}>
                  <FileText className="h-4 w-4 mr-2" />
                  Submit to Job
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <AddToListMenu
              entityType="person"
              entityId={personId}
              entityLabel={personName}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface ConnectionControlsProps {
  state: ConnectionState;
  busy: boolean;
  onConnect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
  onMessage: () => void;
}

function ConnectionControls({
  state,
  busy,
  onConnect,
  onAccept,
  onReject,
  onCancel,
  onDisconnect,
  onMessage,
}: ConnectionControlsProps) {
  if (state === "pending_received") {
    return (
      <div className="flex gap-2">
        <Button onClick={onAccept} disabled={busy}>
          <CheckCircle className="h-4 w-4 mr-2" />
          Accept Connection
        </Button>
        <Button variant="outline" onClick={onReject} disabled={busy}>
          <X className="h-4 w-4 mr-2" />
          Decline
        </Button>
      </div>
    );
  }

  if (state === "pending_sent") {
    return (
      <div className="flex gap-2">
        <Button variant="outline" disabled>
          <Clock className="h-4 w-4 mr-2" />
          Request Sent
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4 mr-2" />
          Revoke
        </Button>
      </div>
    );
  }

  if (state === "connected") {
    return (
      <div className="flex gap-2">
        <Button onClick={onMessage}>
          <MessageCircle className="h-4 w-4 mr-2" />
          Message
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Connection options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={onDisconnect}
              disabled={busy}
              className="text-destructive focus:text-destructive"
            >
              <X className="h-4 w-4 mr-2" />
              Remove connection
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <Button onClick={onConnect} disabled={busy}>
      <UserPlus className="h-4 w-4 mr-2" />
      Connect
    </Button>
  );
}
