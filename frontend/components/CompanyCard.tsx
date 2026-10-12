import {
  MapPin,
  Eye,
  Briefcase,
  Calendar,
  Building2,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { publicCompanyPath } from "@shared/public-paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { EntityCloneItem } from "@/components/EntityCloneItem";
import { buildTrackAction } from "@/lib/card-track-action";
import { buildShareAction } from "@/lib/card-share-action";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/use-toast";
import type { CompanyMetadata, CompanyWithOwnership } from "@/types/company";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import EntityMedia from "@/components/studio/EntityMedia";
import CreateVideoMenuItem from "@/components/studio/CreateVideoMenuItem";
import { ReviewRatingBadge } from "@/components/reviews/ReviewRatingBadge";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import { studioEditHref } from "@/lib/studio/studio-authoring";

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
  const { isOwner: isOwned, isTracked, isAuthenticated } = useEntityOwnership({
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
        return "bg-accent text-accent-foreground";
      case "draft":
        return "bg-amber-100 text-amber-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-muted text-foreground";
      default:
        return "bg-muted text-foreground";
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
      className: "text-xs bg-amber-50 text-amber-700",
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

  // Use dynamic actions if provided and not empty, otherwise fallback to default actions.
  // Track action self-gates on auth + owner via `buildTrackAction`; the null
  // entry is filtered before the actions array is handed to CardActions.
  const fallbackActions: Array<DynamicCardAction | null> = [
    {
      id: "view",
      label: "View",
      variant: "outline",
      icon: Eye,
      onClick: () => {
        if (onView) {
          onView();
        } else {
          navigate(publicCompanyPath(company.id));
        }
      },
    },
    buildTrackAction({
      isAuthenticated,
      isOwn: isOwned,
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
    buildShareAction({
      entityUrl: publicCompanyPath(company.id),
      shareTitle: company.name,
      shareText: company.tagline || undefined,
      onActions,
      copySuccessDescription: "Company link has been copied to your clipboard.",
    }),
  ];
  const cardActions: DynamicCardAction[] = actions && actions.length > 0
    ? actions
    : fallbackActions.filter((a): a is DynamicCardAction => a !== null);

  // Owner-only menu extras — same items in both vertical and horizontal
  // layouts so an owner browsing the list view doesn't lose Edit / Create
  // Video access.
  // Default clone handler — `POST /api/companies/:id/clone` via apiClient,
  // then navigate to the clone's edit page. Backend appends " (Copy)" to
  // the name + regenerates the slug, lands the clone as inactive.
  const handleCloneCompany = async () => {
    try {
      const res = await apiClient.post<{ id: string }>(
        `/api/companies/${company.id}/clone`,
      );
      if (res.data?.id) {
        toast({ title: "Company cloned", description: `"${company.name} (Copy)" is ready to edit.` });
        navigate(studioEditHref("company", res.data.id));
      }
    } catch (err) {
      toast({
        title: "Couldn't clone company",
        description: (err as Error).message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };
  const ownerMenuExtras = (
    <>
      {extraMenuItems}
      {canEdit && company.id && (
        <DropdownMenuItem asChild>
          <Link to={studioEditHref("company", company.id)} className="cursor-pointer">
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Link>
        </DropdownMenuItem>
      )}
      <EntityCloneItem
        isOwner={isOwned}
        onClone={isOwned && company.id ? handleCloneCompany : undefined}
        label="Clone Company"
      />
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
            <a href={publicCompanyPath(company.id)} className="font-semibold hover:underline truncate block">
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
            <ReviewRatingBadge
              value={company.reviewAvgOverall}
              count={company.reviewCount}
              href={`${publicCompanyPath(company.slug ?? company.id)}/reviews`}
            />
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
    <BaseCard className="flex flex-col h-full">
      <CardHeaderWithAvatar
        title={company.name}
        subtitle={company.tagline}
        avatar={{
          src: company.logo,
          fallback: company.name.substring(0, 2).toUpperCase(),
          size: "md",
        }}
        badges={badges}
        linkTo={publicCompanyPath(company.id)}
      />

      <CardContent className="flex-1">

        {/* Onboarding Progress */}
        {onboardingStatus.show && canEdit && (
          <div className="mt-3 p-3 bg-amber-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-900">
                Company Setup
              </span>
              <span className="text-xs text-amber-700">
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
            <ReviewRatingBadge
              value={company.reviewAvgOverall}
              count={company.reviewCount}
              href={`${publicCompanyPath(company.slug ?? company.id)}/reviews`}
            />
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

          {/* Studio media linked to this company (#271) — promo /
              culture clips of any mediaKind. EntityMedia compares the
              auth'd viewer to the company's owner userId and only
              renders the create chip when they match. */}
          {company.id && (
            <EntityMedia
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
