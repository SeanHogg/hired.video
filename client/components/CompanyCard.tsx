import {
  MapPin,
  Users,
  Eye,
  Briefcase,
  UserCheck,
  Edit,
  Calendar,
  Building2,
  TrendingUp,
  AlertCircle,
  Share,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { useAuth } from "@/lib/auth";
import type { CompanyMetadata, CompanyWithOwnership } from "@/types/company";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface CompanyCardProps {
  company: CompanyMetadata | CompanyWithOwnership;
  showOwnership?: boolean;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  // eslint-disable-next-line no-unused-vars
  onTrack?: (_companyId: string) => void;
  // eslint-disable-next-line no-unused-vars
  onUntrack?: (_companyId: string) => void;
  onView?: () => void;
  onActions?: () => void;
}

export default function CompanyCard({
  company,
  showOwnership = false,
  actions,
  userContext: _userContext, // eslint-disable-line no-unused-vars
  itemOwnership: _itemOwnership, // eslint-disable-line no-unused-vars
  onTrack: _onTrack, // eslint-disable-line no-unused-vars
  onUntrack: _onUntrack, // eslint-disable-line no-unused-vars
  onView,
  onActions,
}: CompanyCardProps) {
  const { user } = useAuth();

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

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case "public":
        return null;
      case "private":
        return <Eye className="h-3 w-3" />;
      case "draft":
        return <Edit className="h-3 w-3" />;
      default:
        return null;
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

  // Prepare badges for header
  const badges = [];

  if (showOwnership && isTracked) {
    badges.push({
      text: "Following",
      variant: "outline" as const,
      className: "text-xs bg-blue-50 text-blue-700",
      icon: UserCheck
    });
  }

  if (canEdit && (company.status === "draft" || company.status === "onboarding")) {
    badges.push({
      text: "Setup Required",
      variant: "outline" as const,
      className: "text-xs bg-orange-50 text-orange-700",
      icon: AlertCircle
    });
  }

  badges.push({
    text: company.status,
    variant: "secondary" as const,
    className: getStatusColor(company.status)
  });

  if (getVisibilityIcon(company.visibility)) {
    badges.push({
      text: "",
      variant: "outline" as const,
      className: "text-xs",
      icon: () => getVisibilityIcon(company.visibility)
    });
  }

  // Use dynamic actions if provided and not empty, otherwise fallback to default actions
  const cardActions = (actions && actions.length > 0) ? actions : [
    {
      id: "view",
      label: "View",
      variant: "outline" as const,
      icon: Eye,
      onClick: () => {
        if (onView) {
          onView();
        } else {
          window.location.href = `/companies/${company.id}`;
        }
      }
    },
    {
      id: "share",
      label: "Share",
      variant: "default" as const,
      icon: Share,
      onClick: () => {
        if (onActions) {
          onActions();
        } else {
          // Default share functionality - copy link to clipboard
          const url = `${window.location.origin}/companies/${company.id}`;
          navigator.clipboard.writeText(url).then(() => {
            // Could show a toast notification here
            alert('Company link copied to clipboard!');
          }).catch(() => {
            // Fallback for older browsers
            prompt('Copy this link:', url);
          });
        }
      }
    }
  ];

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={company.name}
        subtitle={company.tagline}
        avatar={{
          src: company.logo,
          fallback: company.name.substring(0, 2).toUpperCase(),
          size: "md"
        }}
        badges={badges}
        linkTo={`/companies/${company.id}`}
      />

      <CardContent>
        <div className="space-y-3">
          {/* Company Details */}
          <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1 min-w-0">
                  <Building2 className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{company.industry}</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <Users className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{company.size}</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{company.location}</span>
                </div>
              </div>

          {/* Visibility (status is already shown in header) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {getVisibilityIcon(company.visibility) && (
              <Badge variant="outline" className="text-xs">
                {getVisibilityIcon(company.visibility)}
              </Badge>
            )}
          </div>
        </div>

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
          {/* Job Statistics */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{company.activeJobCount}</div>
                <div className="text-xs text-muted-foreground">Active Jobs</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{company.followers}</div>
                <div className="text-xs text-muted-foreground">Followers</div>
              </div>
            </div>
          </div>

          {/* Company Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {company.views} views
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Founded {new Date(company.createdAt).getFullYear()}
              </div>
            </div>
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
