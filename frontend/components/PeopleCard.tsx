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
import { publicProfilePath } from "@shared/public-paths";
import { buildTrackAction } from "@/lib/card-track-action";
import { buildShareAction } from "@/lib/card-share-action";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import { useAuth } from "@/lib/auth";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import EntityMedia from "@/components/studio/EntityMedia";
import CreateVideoMenuItem from "@/components/studio/CreateVideoMenuItem";
import { normalizeRole, createRolePermissions } from "@/lib/role-utils";
import { getPersonDisplayName, getPersonInitials, getPersonRoleLabel } from "@/lib/person-display";
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
  /** Extra dropdown items appended to the card's overflow menu (e.g. AddToListMenu). */
  extraMenuItems?: React.ReactNode;
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
  extraMenuItems,
}: PeopleCardProps) {
  const { t } = useTranslation();
  // `user` is still needed for role-based gates below (talent-pool button
  // checks `createRolePermissions(user.role)`); pure ownership questions
  // route through `useEntityOwnership` so this card stays in lockstep
  // with EntityMedia and the other card surfaces.
  const { user } = useAuth();
  const ownership =
    person && "ownership" in person ? person.ownership : undefined;
  // `isOwner` from the shared hook already encodes (`ownership === "owned"`
   // OR viewer-id-match), so this card consumes it directly — no inline
   // re-derive (gap #408). Hook also enforces "SA gets no admin-override
   // on profile-shaped entities" — only the actual owner sees Edit.
  const { isAuthenticated, isOwner: isOwnProfile } = useEntityOwnership({
    ownerUserId: person?.id,
    ownership,
  });
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [connectMessage, setConnectMessage] = useState("");

  // Early return if person is undefined — hooks above tolerate undefined.
  if (!person) {
    return null;
  }

  const handleSendConnect = () => {
    onConnect?.(person.id, connectMessage);
    setShowConnectDialog(false);
    setConnectMessage("");
  };

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
        return "bg-accent text-accent-foreground";
      case "busy":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-muted text-foreground";
      default:
        return "bg-muted text-foreground";
    }
  };

  // Status is a known enum (active/looking/busy/inactive); localize via i18n
  // with the raw value as fallback so an unexpected status still renders.
  const statusLabel = (status: string) =>
    t(`peopleCard.status.${status}`, { defaultValue: status });

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

  // Display normalization — SINGLE seam at lib/person-display.ts
  // (#1657 — fixed the duplicate-fallback anti-pattern that surfaced
  // as blank names on the People grid when this card was a sibling
  // copy of the same derivation logic in DiscoverPeopleGrid).
  const displayFullName = getPersonDisplayName(person, t);
  const initials = getPersonInitials(person, t);

  // Build the card footer actions — connection state drives the primary action.
  const fallbackActions: Array<DynamicCardAction | null> = [];

  // Connection / own-profile action comes first
  if (isOwnProfile) {
    fallbackActions.push({
      id: "edit-profile",
      label: t("actions.editProfile"),
      variant: "default",
      icon: ExternalLink,
      onClick: () => { window.location.href = "/profile"; },
    });
  } else if (isPendingReceived) {
    fallbackActions.push({
      id: "accept",
      label: t("actions.accept"),
      variant: "default",
      icon: CheckCircle,
      onClick: () => onAcceptConnection?.(person.id),
    });
    fallbackActions.push({
      id: "reject",
      label: t("actions.reject"),
      variant: "outline",
      icon: X,
      onClick: () => onRejectConnection?.(person.id),
    });
  } else if (isPendingSent) {
    fallbackActions.push({
      id: "pending",
      label: t("labels.pending"),
      variant: "outline",
      icon: Clock,
      onClick: () => {
        window.location.href = publicProfilePath(person.slug || person.id);
      },
    });
  } else if (isConnected) {
    fallbackActions.push({
      id: "message",
      label: t("actions.message"),
      variant: "outline",
      icon: MessageCircle,
      onClick: () => onMessage?.(person.id),
    });
  } else if (user) {
    fallbackActions.push({
      id: "connect",
      label: t("actions.connect"),
      variant: "default",
      icon: UserPlus,
      onClick: () => setShowConnectDialog(true),
    });
  }

  // View — always available (goes into dropdown)
  fallbackActions.push({
    id: "view",
    label: t("actions.viewProfile"),
    variant: "outline",
    icon: Eye,
    onClick: () => {
      if (onView) {
        onView();
      } else {
        window.location.href = publicProfilePath(person.slug || person.id);
      }
    },
  });

  // Follow / Unfollow — authenticated, non-owner only. `buildTrackAction`
  // self-gates and returns null otherwise; the null entry is filtered out
  // when we materialise `cardActions` below.
  fallbackActions.push(
    buildTrackAction({
      isAuthenticated,
      isOwn: isOwnProfile,
      isTracked,
      trackLabel: t("actions.follow"),
      trackedLabel: t("labels.following"),
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

  // Share — always available, including for unauthenticated viewers and
  // the profile owner themselves. This is the only meaningful overflow
  // action an anonymous viewer gets, and it's the platform-wide pattern
  // (resumes, jobs, companies all expose Share to everyone).
  fallbackActions.push(
    buildShareAction({
      entityUrl: publicProfilePath(person.slug || person.id),
      shareTitle: displayFullName,
      shareText: person.headline || undefined,
      onActions,
      copySuccessDescription: t("messages.profileLinkCopied", {
        defaultValue: "Profile link has been copied to your clipboard.",
      }),
    }),
  );

  const cardActions: DynamicCardAction[] = actions && actions.length > 0
    ? actions
    : fallbackActions.filter((a): a is DynamicCardAction => a !== null);

  // Connect dialog defined once and rendered in both layouts (DRY) — the
  // vertical layout previously carried a hardcoded English duplicate.
  const connectDialog = (
    <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("headings.sendConnectionRequest")}</DialogTitle>
          <DialogDescription>
            {t("messages.connectionRequestDesc", { name: displayFullName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder={t("fields.connectionMessage.placeholder")}
            value={connectMessage}
            onChange={(e) => setConnectMessage(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConnectDialog(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleSendConnect}>
              <Send className="h-4 w-4 mr-2" />
              {t("actions.sendRequest")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (layout === "horizontal") {
    return (
      <>
        <BaseCard className="flex flex-row items-center overflow-hidden">
          <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
            <Avatar className="w-10 h-10 flex-shrink-0">
              <AvatarImage src={person.avatar} alt={displayFullName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <a href={publicProfilePath(person.slug || person.id)} className="font-semibold hover:underline truncate block">
                {displayFullName}
              </a>
              <p className="text-sm text-muted-foreground truncate">{person.headline}</p>
            </div>
            <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
              {isAuthenticated && (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{person.location}</span>
              )}
              {person.currentCompany && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{person.currentCompany}</span>}
            </div>
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              {person.isCreator && (
                <Badge variant="outline" className="text-xs bg-accent text-primary border-primary/30">{t("labels.creator")}</Badge>
              )}
              {person.openToWork && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">{t("labels.openToWork")}</Badge>
              )}
              <Badge variant="secondary" className={getStatusColor(person.status)}>{statusLabel(person.status)}</Badge>
            </div>
          </div>
          <div className="flex-shrink-0 p-2">
            <CardActions
              actions={cardActions}
              className="border-t-0 p-0 bg-transparent"
              extraMenuItems={extraMenuItems}
            />
          </div>
        </BaseCard>

        {connectDialog}
      </>
    );
  }

  return (
    <BaseCard className="overflow-hidden flex flex-col h-full">
      <CardHeader className="pb-3 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Profile Avatar */}
            <Avatar className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
              <AvatarImage src={person.avatar} alt={displayFullName} />
              <AvatarFallback className="text-xs sm:text-sm">{initials}</AvatarFallback>
            </Avatar>

            {/* Person Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                <CardTitle className="text-base sm:text-lg hover:text-primary truncate">
                  <Link to={publicProfilePath(person.slug || person.id)}>{displayFullName}</Link>
                </CardTitle>
                <div className="flex items-center gap-1 sm:gap-2">
                  {person.emailConfirmed && (
                    <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                  )}
                  {person.isPro && (
                    <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
                  )}
                  {isConnected && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-50 text-green-700 flex-shrink-0"
                    >
                      <Users className="h-3 w-3 mr-1" />
                      {t("labels.connected")}
                    </Badge>
                  )}
                </div>
              </div>

              {person.headline && (
                <CardDescription className="text-xs sm:text-sm mb-2 line-clamp-2">
                  {person.headline}
                </CardDescription>
              )}

              {/* Role chip is public info (already visible on the public
                  profile page). Location is authenticated-only — that's
                  PII a casual viewer shouldn't see. Active/joined ditto. */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground">
                {person.role && (
                  <div className="flex items-center gap-1">
                    {getRoleIcon(person.role)}
                    <span>{getPersonRoleLabel(person.role, t)}</span>
                  </div>
                )}
                {isAuthenticated && person.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{person.location}</span>
                  </div>
                )}
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
              {statusLabel(person.status)}
            </Badge>
            {person.isCreator && (
              <Badge
                variant="outline"
                className="text-xs bg-accent text-primary border-primary/30"
              >
                {t("labels.creator")}
              </Badge>
            )}
            {person.openToWork && (
              <Badge
                variant="outline"
                className="text-xs bg-green-50 text-green-700"
              >
                {t("labels.openToWork")}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
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
              <span className="truncate">{t("peopleCard.atCompany", { company: person.companyName })}</span>
            </div>
          )}

          {/* Engagement metrics (connections, followers, profile views) are
              owner-only — they're personal analytics, not social proof for the
              public. */}
          {isOwnProfile && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs text-center">
                <div>
                  <div className="font-medium">{person.connectionCount}</div>
                  <div className="text-muted-foreground">{t("labels.connections")}</div>
                </div>
                <div>
                  <div className="font-medium">{person.followerCount}</div>
                  <div className="text-muted-foreground">{t("labels.followers")}</div>
                </div>
              </div>
              <OwnerMetricsRow isOwner={isOwnProfile} className="justify-center pt-1">
                <Metric icon={Eye} value={person.profileViews ?? 0} label={t("peopleCard.profileViews")} />
              </OwnerMetricsRow>
            </>
          )}

          {/* Active / Joined timestamps are authenticated-only. */}
          {isAuthenticated && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t("peopleCard.active", {
                  date:
                    person.lastActiveAt &&
                    !isNaN(new Date(person.lastActiveAt).getTime())
                      ? new Date(person.lastActiveAt).toLocaleDateString()
                      : t("labels.unknown"),
                })}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {t("peopleCard.joined", {
                  date:
                    person.createdAt &&
                    !isNaN(new Date(person.createdAt).getTime())
                      ? new Date(person.createdAt).toLocaleDateString()
                      : t("labels.unknown"),
                })}
              </div>
            </div>
          )}

          {/* Add to Talent Pool (Recruiters only) */}
          {user && !isOwnProfile && createRolePermissions(user.role).isRecruiter && onAddToTalentPool && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant={isInTalentPool ? "secondary" : "outline"}
                size="sm"
                onClick={() => onAddToTalentPool(person.id)}
                disabled={isInTalentPool}
                title={isInTalentPool ? t("peopleCard.alreadyInTalentPool") : t("peopleCard.addToTalentPool")}
              >
                <UserCog className="h-3 w-3 mr-1" />
                {isInTalentPool ? t("peopleCard.inTalentPool") : t("peopleCard.addToTalentPool")}
              </Button>
            </div>
          )}

          {/* Studio media linked to this profile (#271). For a profile
              the "owner" is the person themselves — pass person.id and
              EntityMedia hides the create chip for everyone else.
              EntityMedia renders any mediaKind they attached. */}
          <EntityMedia
            subject={{ kind: "profile", id: person.id }}
            ownerUserId={person.id}
          />
        </div>
      </CardContent>

      <CardActions
        actions={cardActions}
        extraMenuItems={
          <>
            {extraMenuItems}
            {isOwnProfile && (
              <CreateVideoMenuItem subject={{ kind: "profile", id: person.id }} />
            )}
          </>
        }
      />

      {/* Connect Dialog — triggered from the Connect action in CardActions */}
      {connectDialog}
    </BaseCard>
  );
}
