import {
  MapPin,
  Users,
  Briefcase,
  UserCheck,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Building2,
  MessageCircle,
  UserPlus,
  Clock,
  CheckCircle,
  X,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardActions } from "@/components/ui/CardActions";
import { useAuth } from "@/lib/auth";
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
  onTrack?: (personId: string) => void;
  onUntrack?: (personId: string) => void;
  onConnect?: (personId: string) => void;
  onMessage?: (personId: string) => void;
  onAcceptConnection?: (personId: string) => void;
  onRejectConnection?: (personId: string) => void;
  onView?: () => void;
  onActions?: () => void;
}

export default function PeopleCard({
  person,
  connectionStatus = "none",
  showOwnership = false,
  actions,
  userContext: _userContext, // eslint-disable-line no-unused-vars
  itemOwnership: _itemOwnership, // eslint-disable-line no-unused-vars
  onTrack,
  onUntrack,
  onConnect,
  onMessage,
  onAcceptConnection,
  onRejectConnection,
  onView,
  onActions,
}: PeopleCardProps) {
  const { user } = useAuth();

  // Early return if person is undefined
  if (!person) {
    return null;
  }

  const ownership = "ownership" in person ? person.ownership : undefined;
  const isTracked = ownership === "tracked";
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "job_seeker":
        return <Users className="h-3 w-3" />;
      case "recruiter":
        return <UserCheck className="h-3 w-3" />;
      case "business":
        return <Building2 className="h-3 w-3" />;
      default:
        return <Users className="h-3 w-3" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "job_seeker":
        return "Job Seeker";
      case "recruiter":
        return "Recruiter";
      case "business":
        return "Business";
      default:
        return role;
    }
  };

  // Derive safe display name and initials
  const displayFullName = (person.fullName && person.fullName.trim().length > 0)
    ? person.fullName
    : (person as { name?: string })?.name?.toString()?.trim?.() || `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || "User";
  const firstInitial = ((person.firstName?.[0]) ?? displayFullName?.trim()?.[0] ?? "?")
    .toString()
    .toUpperCase();
  const lastInitial = ((person.lastName?.[0]) ?? displayFullName?.trim()?.split(" ").slice(-1)[0]?.[0] ?? "")
    .toString()
    .toUpperCase();

  // Use passed actions or fallback to default actions
  const cardActions = actions && actions.length > 0 ? actions : [
    {
      id: "view",
      label: "View",
      variant: "outline" as const,
      icon: UserCheck,
      onClick: () => {
        if (onView) {
          onView();
        } else {
          window.location.href = `/people/${person.id}`;
        }
      }
    },
    {
      id: "actions",
      label: "Actions",
      variant: "default" as const,
      icon: MessageCircle,
      onClick: () => {
        if (onActions) {
          onActions();
        } else {
          console.log("Actions clicked for person:", person.id);
        }
      }
    }
  ];

  return (
    <Card className="hover:shadow-lg transition-shadow relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {/* Profile Avatar */}
            <Avatar className="w-12 h-12 flex-shrink-0">
              <AvatarImage src={person.avatar} alt={displayFullName} />
              <AvatarFallback className="text-sm">
                {firstInitial}
                {lastInitial}
              </AvatarFallback>
            </Avatar>

            {/* Person Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-lg hover:text-primary truncate">
                  <Link to={`/people/${person.id}`}>{person.fullName}</Link>
                </CardTitle>
                {person.isVerified && (
                  <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                )}
                {person.isPremium && (
                  <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                )}
                {showOwnership && isTracked && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-blue-50 text-blue-700 flex-shrink-0"
                  >
                    <UserCheck className="h-3 w-3 mr-1" />
                    Following
                  </Badge>
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

              <CardDescription className="text-sm mb-2 line-clamp-2">
                {person.headline}
              </CardDescription>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  {getRoleIcon(person.role)}
                  <span>{getRoleLabel(person.role)}</span>
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

          {/* Company Info (for recruiters/business) */}
          {person.companyName && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">at {person.companyName}</span>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div>
              <div className="font-medium">{person.connectionCount}</div>
              <div className="text-muted-foreground">Connections</div>
            </div>
            <div>
              <div className="font-medium">{person.followerCount}</div>
              <div className="text-muted-foreground">Followers</div>
            </div>
            <div>
              <div className="font-medium">{person.profileViews}</div>
              <div className="text-muted-foreground">Views</div>
            </div>
          </div>

          {/* Last Active */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Active {person.lastActiveAt && !isNaN(new Date(person.lastActiveAt).getTime())
                ? new Date(person.lastActiveAt).toLocaleDateString()
                : "Unknown"}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Joined {person.createdAt && !isNaN(new Date(person.createdAt).getTime())
                ? new Date(person.createdAt).toLocaleDateString()
                : "Unknown"}
            </div>
          </div>



          {/* Connection Actions (Secondary Row) */}
          {user && person.id !== user.id && (
            <div className="flex items-center gap-2 pt-2">
              {isPendingReceived ? (
                <div className="flex gap-1 flex-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => onAcceptConnection?.(person.id)}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRejectConnection?.(person.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : isPendingSent ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Pending
                </Button>
              ) : isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onMessage?.(person.id)}
                >
                  <MessageCircle className="h-3 w-3 mr-1" />
                  Message
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => onConnect?.(person.id)}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Connect
                </Button>
              )}

              {/* Track/Untrack */}
              {!isConnected && (
                <div>
                  {isTracked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUntrack?.(person.id)}
                    >
                      <BookmarkCheck className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTrack?.(person.id)}
                    >
                      <Bookmark className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Own Profile */}
          {user && person.id === user.id && (
            <div className="flex items-center gap-2 pt-2">
              <Button asChild className="flex-1">
                <Link to="/profile">
                  Edit Profile
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </Card>
  );
}
