import {
  Eye,
  Calendar,
  Star,
  Globe,
  Users,
  Lock,
  Copy,
  Target,
  Edit,
  UserCheck,
  Share,
} from "lucide-react";

import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { formatDate } from "@/lib/utils";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface ResumeCardProps {
  id: string;
  slug?: string;
  name: string;
  title?: string;
  summary: string;
  createdAt: string;
  views?: number;
  privacy?: "public" | "recruiter_only" | "private" | "draft";
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string;
  ownership?: "owned" | "tracked";
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  onView?: () => void;
  onActions?: () => void;
}

export default function ResumeCard({
  id,
  slug,
  name,
  title,
  summary,
  createdAt,
  views = 0,
  privacy = "private",
  isMaster = false,
  isActive = false,
  parentId,
  ownership = "owned",
  actions,
  userContext: _userContext, // eslint-disable-line no-unused-vars
  itemOwnership: _itemOwnership, // eslint-disable-line no-unused-vars
  onView,
  onActions,
}: ResumeCardProps) {
  const getPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case "public":
        return <Globe className="w-3 h-3" />;
      case "recruiter_only":
        return <Users className="w-3 h-3" />;
      case "private":
        return <Lock className="w-3 h-3" />;
      case "draft":
        return <Edit className="w-3 h-3" />;
      default:
        return <Lock className="w-3 h-3" />;
    }
  };

  const getPrivacyText = (privacy: string) => {
    switch (privacy) {
      case "public":
        return "Public";
      case "recruiter_only":
        return "Recruiter Only";
      case "private":
        return "Private";
      case "draft":
        return "Draft";
      default:
        return "Private";
    }
  };

  const getPrivacyColor = (privacy: string) => {
    switch (privacy) {
      case "public":
        return "bg-green-100 text-green-800";
      case "recruiter_only":
        return "bg-blue-100 text-blue-800";
      case "private":
        return "bg-gray-100 text-gray-800";
      case "draft":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Prepare badges for header (consistent with JobCard pattern)
  const badges = [];

  if (ownership === "tracked") {
    badges.push({
      text: "Tracked",
      variant: "secondary" as const,
      className: "text-xs bg-blue-100 text-blue-800",
      icon: () => <UserCheck className="w-3 h-3" />,
    });
  }

  if (isActive) {
    badges.push({
      text: "Active",
      variant: "secondary" as const,
      className: "text-xs bg-green-100 text-green-800",
      icon: () => <Target className="w-3 h-3" />,
    });
  }

  if (isMaster) {
    badges.push({
      text: "Master",
      variant: "secondary" as const,
      className: "text-xs bg-yellow-100 text-yellow-800",
      icon: () => <Star className="w-3 h-3" />,
    });
  }

  if (parentId) {
    badges.push({
      text: "Variation",
      variant: "outline" as const,
      className: "text-xs",
      icon: () => <Copy className="w-3 h-3" />,
    });
  }

  badges.push({
    text: getPrivacyText(privacy),
    variant: "secondary" as const,
    className: `text-xs ${getPrivacyColor(privacy)}`,
    icon: () => getPrivacyIcon(privacy),
  });

  // Use dynamic actions if provided and not empty, otherwise fallback to default actions
  const cardActions =
    actions && actions.length > 0
      ? actions
      : [
          {
            id: "view",
            label: "View",
            variant: "outline" as const,
            icon: Eye,
            onClick: () => {
              if (onView) {
                onView();
              } else {
                window.location.href = `/resumes/${id}`;
              }
            },
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
                const url = `${window.location.origin}/resumes/${id}`;
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    // Could show a toast notification here
                    alert("Resume link copied to clipboard!");
                  })
                  .catch(() => {
                    // Fallback for older browsers
                    prompt("Copy this link:", url);
                  });
              }
            },
          },
        ];

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={name}
        subtitle={title}
        avatar={{
          src: undefined, // Resumes don't typically have avatars
          fallback: "R",
          size: "md",
        }}
        badges={badges}
        linkTo={`/resumes/${id}`}
      />

      <CardContent>
        <div className="space-y-4">
          {/* Professional Summary */}
          <div className="p-4 bg-primary text-primary-foreground rounded-lg">
            <h4 className="font-bold text-lg mb-2">Professional Summary</h4>
            <p className="text-sm leading-relaxed opacity-95 line-clamp-3">
              {summary}
            </p>
          </div>

          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>CREATED</span>
              </div>
              <span className="font-medium text-foreground">
                {formatDate(createdAt)}
              </span>
              {slug && (
                <span className="ml-3 text-muted-foreground">Slug: <span className="font-mono text-foreground">{slug}</span></span>
              )}
            </div>

            {views > 0 && (
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                <span>{views} views</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </BaseCard>
  );
}
