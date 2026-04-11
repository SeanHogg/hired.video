import {
  MapPin,
  Eye,
  Briefcase,
  Calendar,
  Building2,
  AlertCircle,
  Share,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { buildTrackAction } from "@/lib/card-track-action";
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import type { CompanyMetadata, CompanyWithOwnership } from "@/types/company";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface CompanyCardProps {
  company: CompanyMetadata | CompanyWithOwnership;
  showOwnership?: boolean;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
   
  onTrack?: (_companyId: string) => void;
   
  onUntrack?: (_companyId: string) => void;
  onView?: () => void;
  onActions?: () => void;
}

export default function CompanyCard({
  company,
  showOwnership: _showOwnership = false,
  actions,
  userContext: _userContext,
  itemOwnership: _itemOwnership,
  onTrack,
  onUntrack,
  onView,
  onActions,
}: CompanyCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Early return if company is undefined
  if (!company) {
    return null;
  }

  const ownership = "ownership" in company ? company.ownership : undefined;
  const isOwned =
    ownership === "owned" ||
    (!ownership &&
      (company.userId === user?.id ||
        company.teamMembers?.includes(user?.id || "")));
  const isTracked = ownership === "tracked";
  const canEdit = isOwned;

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
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </BaseCard>
  );
}
