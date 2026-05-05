import {
  MapPin,
  Eye,
  Briefcase,
  Calendar,
  Building2,
  AlertCircle,
  Share,
  Pencil,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { buildTrackAction } from "@/lib/card-track-action";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { toast } from "@/components/ui/use-toast";
import type { CompanyMetadata, CompanyWithOwnership } from "@/types/company";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import EntityVideos from "@/components/studio/EntityVideos";
import CreateVideoMenuItem from "@/components/studio/CreateVideoMenuItem";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface CompanyCardProps {
  company: CompanyMetadata | CompanyWithOwnership;
  showOwnership?: boolean;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  layout?: "vertical" | "horizontal";

  onTrack?: (_companyId: string) => void;

  onUntrack?: (_companyId: string) => void;
  onView?: () => void;
  onActions?: () => void;
  /** Extra dropdown items appended to the card's overflow menu (e.g. AddToListMenu). */
  extraMenuItems?: React.ReactNode;
}

export default function CompanyCard({
  company,
  showOwnership: _showOwnership = false,
  actions,
  userContext: _userContext,
  itemOwnership: _itemOwnership,
  layout = "vertical",
  onTrack,
  onUntrack,
  onView,
  onActions,
  extraMenuItems,
}: CompanyCardProps) {
  const navigate = useNavigate();

  const ownership =
    company && "ownership" in company ? company.ownership : undefined;
  // Single source of truth — extra predicate covers the company-specific
  // case where ownership extends past `userId` to listed team members.
  const { isOwner: isOwned, isTracked } = useEntityOwnership({
    ownerUserId: company?.userId,
    ownership,
    extraOwnerPredicates: [
      (viewerUserId) => company?.teamMembers?.includes(viewerUserId) ?? false,
    ],
  });
  const canEdit = isOwned;

  // Early return if company is undefined — hooks above run unconditionally
  // and tolerate undefined via `?.` access.
  if (!company) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "onboarding":
        return "bg-blue-100 text-blue-800";
      case "draft":
        return "bg-orange-100 text-orange-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getOnboardingStatus = () => {
    if (company.status === "draft" || company.status === "onboarding") {
      const progress = company.onboardingProgress || 0;
      return {
        show: true,
        progress,
        message:
          progress === 100 ? "Ready to publish" : `${progress}% complete`,
      };
    }
    return { show: false, progress: 0, message: "" };
  };

  const onboardingStatus = getOnboardingStatus();

  // Prepare badges for header. Follow/track state lives in the bottom action row.
  const badges = [];

  if (
    canEdit &&
    (company.status === "draft" || company.status === "onboarding")
  ) {
    badges.push({
      text: "Setup Required",
      variant: "outline" as const,
      className: "text-xs bg-orange-50 text-orange-700",
      icon: AlertCircle,
    });
  }

  badges.push({
    text: company.status,
    variant: "secondary" as const,
    className: getStatusColor(company.status),
  });

  // Add company size badge if available
  if (company.size) {
    badges.push({
      text: company.size,
      variant: "outline" as const,
      className: "text-xs",
      icon: Building2,
    });
  }

  // Add industry badge if available
  if (company.industry) {
    badges.push({
      text: company.industry,
      variant: "outline" as const,
      className: "text-xs",
    });
  }

  // Use dynamic actions if provided and not empty, otherwise fallback to default actions
  const fallbackActions: DynamicCardAction[] = [
    {
      id: "view",
      label: "View",
      variant: "outline",
      icon: Eye,
      onClick: () => {
        if (onView) {
          onView();
        } else {
          navigate(`/companies/${company.id}`);
        }
      },
    },
    buildTrackAction({
      isTracked,
      trackLabel: "Follow",
      trackedLabel: "Following",
      onToggle: (e) => {
        e.stopPropagation();
        if (isTracked) {
          onUntrack?.(company.id);
        } else {
          onTrack?.(company.id);
        }
      },
    }),
    {
      id: "share",
      label: "Share",
      variant: "default",
      icon: Share,
      onClick: () => {
        if (onActions) {
          onActions();
        } else {
          const url = `${window.location.origin}/companies/${company.id}`;
          navigator.clipboard
            .writeText(url)
            .then(() => {
              toast({
                title: "Link copied!",
                description: "Company link has been copied to your clipboard.",
              });
            })
            .catch(() => {
              prompt("Copy this link:", url);
            });
        }
      },
    },
  ];
  const cardActions = actions && actions.length > 0 ? actions : fallbackActions;

  // Owner-only menu extras — same items in both vertical and horizontal
  // layouts so an owner browsing the list view doesn't lose Edit / Create
  // Video access. SuperAdmin admin-override is handled by useEntityOwnership.
  const ownerMenuExtras = (
    <>
      {extraMenuItems}
      {canEdit && company.id && (
        <DropdownMenuItem asChild>
          <Link to={`/companies/edit/${company.id}`} className="cursor-pointer">
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Link>
        </DropdownMenuItem>
      )}
      {isOwned && company.id && (
        <CreateVideoMenuItem subject={{ kind: "company", id: company.id }} />
      )}
    </>
  );

  if (layout === "horizontal") {
    return (
      <BaseCard className="flex flex-row items-center">
        <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
          <div className="flex-1 min-w-0">
            <a href={`/companies/${company.id}`} className="font-semibold hover:underline truncate block">
              {company.name}
            </a>
            <p className="text-sm text-muted-foreground truncate">{company.tagline}</p>
          </div>
          <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
            {company.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{company.location}</span>}
            {company.industry && <span className="text-xs">{company.industry}</span>}
            {company.size && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{company.size}</span>}
          </div>
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {company.activeJobCount > 0 && (
              <Badge variant="outline" className="text-xs">
                <Briefcase className="h-3 w-3 mr-1" />{company.activeJobCount} Job{company.activeJobCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 p-2">
          <CardActions
            actions={cardActions}
            className="border-t-0 p-0 bg-transparent"
            extraMenuItems={ownerMenuExtras}
          />
        </div>
      </BaseCard>
    );
  }

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={company.name}
        subtitle={company.tagline}
        avatar={{
          src: company.logo,
          fallback: company.name.substring(0, 2).toUpperCase(),
          size: "md",
        }}
        badges={badges}
        linkTo={`/companies/${company.id}`}
      />

      <CardContent>

        {/* Onboarding Progress */}
        {onboardingStatus.show && canEdit && (
          <div className="mt-3 p-3 bg-orange-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-orange-900">
                Company Setup
              </span>
              <span className="text-xs text-orange-700">
                {onboardingStatus.message}
              </span>
            </div>
            <Progress value={onboardingStatus.progress} className="h-2" />
          </div>
        )}
        <div className="space-y-3">
          {/* Company Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {company.activeJobCount > 0 && (
              <div className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {company.activeJobCount} Active Job{company.activeJobCount !== 1 ? 's' : ''}
              </div>
            )}
            {company.founded && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Founded {company.founded}
              </div>
            )}
            {company.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {company.location}
              </div>
            )}
          </div>

          {/* Quick Actions for Jobs */}
          {company.activeJobCount > 0 && (
            <div className="pt-2 border-t">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full text-xs"
              >
                <Link to={`/jobs?company=${encodeURIComponent(company.name)}`}>
                  View {company.activeJobCount} Open Position
                  {company.activeJobCount !== 1 ? "s" : ""}
                </Link>
              </Button>
            </div>
          )}

          {/* Studio videos linked to this company (#271) — promo / culture
              videos. EntityVideos compares the auth'd viewer to the
              company's owner userId and only renders the create chip
              when they match. */}
          {company.id && (
            <EntityVideos
              subject={{ kind: "company", id: company.id }}
              ownerUserId={company.userId}
            />
          )}
        </div>
      </CardContent>

      <CardActions
        actions={cardActions}
        extraMenuItems={ownerMenuExtras}
      />
    </BaseCard>
  );
}
