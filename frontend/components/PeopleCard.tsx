import {
  MapPin,
  Users,
  Briefcase,
  UserCheck,
  ExternalLink,
  Eye,
  Calendar,
  Building2,
  MessageCircle,
  UserPlus,
  Clock,
  CheckCircle,
  X,
  Star,
  UserCog,
  Send,
} from "lucide-react";
import { OwnerMetricsRow, Metric } from "@/components/ui/OwnerMetricsRow";
import { buildTrackAction } from "@/lib/card-track-action";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardActions } from "@/components/ui/CardActions";
import { useAuth } from "@/lib/auth";
import { formatRoleForDisplay, normalizeRole, createRolePermissions } from "@/lib/role-utils";
import { USER_ROLES } from "@shared/user-roles";
import type {
  UserMetadata,
  UserWithOwnership,
  ConnectionStatus,
} from "@/types/people";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";

interface PeopleCardProps {
  person: UserMetadata | UserWithOwnership;
  connectionStatus?: ConnectionStatus;
  showOwnership?: boolean;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  layout?: "vertical" | "horizontal";
  onTrack?: (personId: string) => void;
  onUntrack?: (personId: string) => void;
  onConnect?: (personId: string, message?: string) => void;
  onMessage?: (personId: string) => void;
  onAcceptConnection?: (personId: string) => void;
  onRejectConnection?: (personId: string) => void;
  onView?: () => void;
  onActions?: () => void;
  onAddToTalentPool?: (personId: string) => void;
  isInTalentPool?: boolean;
}

export default function PeopleCard({
  person,
  connectionStatus = "none",
  showOwnership: _showOwnership = false,
  actions,
  userContext: _userContext,
  itemOwnership: _itemOwnership,
  layout = "vertical",
  onTrack,
  onUntrack,
  onConnect,
  onMessage,
  onAcceptConnection,
  onRejectConnection,
  onView,
  onActions,
  onAddToTalentPool,
  isInTalentPool = false,
}: PeopleCardProps) {
  const { user } = useAuth();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [connectMessage, setConnectMessage] = useState("");

  // Early return if person is undefined
  if (!person) {
    return null;
  }

  const handleSendConnect = () => {
    onConnect?.(person.id, connectMessage);
    setShowConnectDialog(false);
    setConnectMessage("");
  };

  const ownership = "ownership" in person ? person.ownership : undefined;
  const isTracked = ownership === "tracked";
  const isOwnProfile = !!user && person.id === user.id;
  const isConnected =
    ownership === "connected" || connectionStatus === "connected";
  const isPendingSent = connectionStatus === "pending_sent";
  const isPendingReceived = connectionStatus === "pending_received";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "looking":
        return "bg-blue-100 text-blue-800";
      case "busy":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleIcon = (role: string | number | undefined | null) => {
    const normalizedRole = normalizeRole(role);
    switch (normalizedRole) {
      case USER_ROLES.JOB_SEEKER:
        return <Users className="h-3 w-3" />;
      case USER_ROLES.RECRUITER:
        return <UserCheck className="h-3 w-3" />;
      case USER_ROLES.EMPLOYER:
        return <Building2 className="h-3 w-3" />;
      case USER_ROLES.ADMIN:
      case USER_ROLES.SUPER_ADMIN:
        return <Building2 className="h-3 w-3" />;
      default:
        return <Users className="h-3 w-3" />;
    }
  };

  // Derive safe display name and initials
  const displayFullName =
    person.fullName && person.fullName.trim().length > 0
      ? person.fullName
      : (person as { name?: string })?.name?.toString()?.trim?.() ||
        `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() ||
        "User";
  const firstInitial = (
    person.firstName?.[0] ??
    displayFullName?.trim()?.[0] ??
    "?"
  )
    .toString()
    .toUpperCase();
  const lastInitial = (
    person.lastName?.[0] ??
    displayFullName?.trim()?.split(" ").slice(-1)[0]?.[0] ??
    ""
  )
    .toString()
    .toUpperCase();

  // Build the card footer actions — connection state drives the primary action.
  const fallbackActions: DynamicCardAction[] = [];

  // Connection / own-profile action comes first
  if (isOwnProfile) {
    fallbackActions.push({
      id: "edit-profile",
      label: "Edit Profile",
      variant: "default",
      icon: ExternalLink,
      onClick: () => { window.location.href = "/profile"; },
    });
  } else if (isPendingReceived) {
    fallbackActions.push({
      id: "accept",
      label: "Accept",
      variant: "default",
      icon: CheckCircle,
      onClick: () => onAcceptConnection?.(person.id),
    });
    fallbackActions.push({
      id: "reject",
      label: "Reject",
      variant: "outline",
      icon: X,
      onClick: () => onRejectConnection?.(person.id),
    });
  } else if (isPendingSent) {
    fallbackActions.push({
      id: "pending",
      label: "Pending",
      variant: "outline",
      icon: Clock,
      disabled: true,
      onClick: () => {},
    });
  } else if (isConnected) {
    fallbackActions.push({
      id: "message",
      label: "Message",
      variant: "outline",
      icon: MessageCircle,
      onClick: () => onMessage?.(person.id),
    });
  } else if (user) {
    fallbackActions.push({
      id: "connect",
      label: "Connect",
      variant: "default",
      icon: UserPlus,
      onClick: () => setShowConnectDialog(true),
    });
  }

  // View — always available (goes into dropdown)
  fallbackActions.push({
    id: "view",
    label: "View Profile",
    variant: "outline",
    icon: Eye,
    onClick: () => {
      if (onView) {
        onView();
      } else {
        window.location.href = `/people/${person.slug || person.id}`;
      }
    },
  });

  // Follow / Unfollow toggle (dropdown)
  if (!isOwnProfile) {
    fallbackActions.push(
      buildTrackAction({
        isTracked,
        trackLabel: "Follow",
        trackedLabel: "Following",
        onToggle: (e) => {
          e.stopPropagation();
          if (isTracked) {
            onUntrack?.(person.id);
          } else {
            onTrack?.(person.id);
          }
        },
      }),
    );
  }

  const cardActions = actions && actions.length > 0 ? actions : fallbackActions;

  if (layout === "horizontal") {
    return (
      <>
        <Card className="hover:shadow-lg transition-shadow flex flex-row items-center">
          <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
            <Avatar className="w-10 h-10 flex-shrink-0">
              <AvatarImage src={person.avatar} alt={displayFullName} />
              <AvatarFallback className="text-xs">{firstInitial}{lastInitial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <a href={`/people/${person.slug || person.id}`} className="font-semibold hover:underline truncate block">
                {displayFullName}
              </a>
              <p className="text-sm text-muted-foreground truncate">{person.headline}</p>
            </div>
            <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{person.location}</span>
              {person.currentCompany && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{person.currentCompany}</span>}
            </div>
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              {person.openToWork && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Open to Work</Badge>
              )}
              <Badge variant="secondary" className={getStatusColor(person.status)}>{person.status}</Badge>
            </div>
          </div>
          <div className="flex-shrink-0 p-2">
            <CardActions actions={cardActions} className="border-t-0 p-0 bg-transparent" />
          </div>
        </Card>

        {/* Connect Dialog */}
        <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Connection Request</DialogTitle>
              <DialogDescription>
                Add a personal message to your connection request to {displayFullName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="I'd love to connect and expand my professional network..."
                value={connectMessage}
                onChange={(e) => setConnectMessage(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowConnectDialog(false)}>Cancel</Button>
                <Button onClick={handleSendConnect}>
                  <Send className="h-4 w-4 mr-2" />Send Request
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow relative overflow-hidden">
      <CardHeader className="pb-3 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Profile Avatar */}
            <Avatar className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
              <AvatarImage src={person.avatar} alt={displayFullName} />
              <AvatarFallback className="text-xs sm:text-sm">
                {firstInitial}
                {lastInitial}
              </AvatarFallback>
            </Avatar>

            {/* Person Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                <CardTitle className="text-base sm:text-lg hover:text-primary truncate">
                  <Link to={`/people/${person.slug || person.id}`}>{person.fullName}</Link>
                </CardTitle>
                <div className="flex items-center gap-1 sm:gap-2">
                  {person.emailConfirmed && (
                    <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
                  )}
                  {person.isPremium && (
                    <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
                  )}
                  {isConnected && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-50 text-green-700 flex-shrink-0"
                    >
                      <Users className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
              </div>

              <CardDescription className="text-xs sm:text-sm mb-2 line-clamp-2">
                {person.headline}
              </CardDescription>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  {getRoleIcon(person.role)}
                  <span>{formatRoleForDisplay(person.role)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>{person.location}</span>
                </div>
                {person.currentCompany && (
                  <div className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">{person.currentCompany}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge
              variant="secondary"
              className={getStatusColor(person.status)}
            >
              {person.status}
            </Badge>
            {person.openToWork && (
              <Badge
                variant="outline"
                className="text-xs bg-green-50 text-green-700"
              >
                Open to Work
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {/* Current Position */}
          {person.currentPosition && (
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{person.currentPosition}</span>
            </div>
          )}

          {/* Company Info (for recruiters/employers) */}
          {person.companyName && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">at {person.companyName}</span>
            </div>
          )}

          {/* Public stats: connections + followers are social proof and stay public.
              Profile views are engagement data → owner-only, shown in its own row below. */}
          <div className="grid grid-cols-2 gap-2 text-xs text-center">
            <div>
              <div className="font-medium">{person.connectionCount}</div>
              <div className="text-muted-foreground">Connections</div>
            </div>
            <div>
              <div className="font-medium">{person.followerCount}</div>
              <div className="text-muted-foreground">Followers</div>
            </div>
          </div>

          <OwnerMetricsRow isOwner={isOwnProfile} className="justify-center pt-1">
            <Metric icon={Eye} value={person.profileViews ?? 0} label="profile views" />
          </OwnerMetricsRow>

          {/* Last Active */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Active{" "}
              {person.lastActiveAt &&
              !isNaN(new Date(person.lastActiveAt).getTime())
                ? new Date(person.lastActiveAt).toLocaleDateString()
                : "Unknown"}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Joined{" "}
              {person.createdAt && !isNaN(new Date(person.createdAt).getTime())
                ? new Date(person.createdAt).toLocaleDateString()
                : "Unknown"}
            </div>
          </div>

          {/* Add to Talent Pool (Recruiters only) */}
          {user && !isOwnProfile && createRolePermissions(user.role).isRecruiter && onAddToTalentPool && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant={isInTalentPool ? "secondary" : "outline"}
                size="sm"
                onClick={() => onAddToTalentPool(person.id)}
                disabled={isInTalentPool}
                title={isInTalentPool ? "Already in talent pool" : "Add to talent pool"}
              >
                <UserCog className="h-3 w-3 mr-1" />
                {isInTalentPool ? "In Talent Pool" : "Add to Talent Pool"}
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <CardActions actions={cardActions} />

      {/* Connect Dialog — triggered from the Connect action in CardActions */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Connection Request</DialogTitle>
            <DialogDescription>
              Add a personal message to your connection request to {displayFullName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="I'd love to connect and expand my professional network..."
              value={connectMessage}
              onChange={(e) => setConnectMessage(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConnectDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendConnect}>
                <Send className="h-3 w-3 mr-2" />
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
