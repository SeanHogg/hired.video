import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Calendar,
  User,
  FileText,
  Star,
  Globe,
  Users,
  Lock,
  Copy,
  Target,
  Edit
} from "lucide-react";

interface ResumeCardProps {
  id: string;
  name: string;
  title?: string;
  summary: string;
  createdAt: string;
  views?: number;
  privacy?: 'public' | 'recruiter_only' | 'private' | 'draft';
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string;
  onView?: () => void;
  onActions?: () => void;
}

export default function ResumeCard({
  name,
  title,
  summary,
  createdAt,
  views = 0,
  privacy = 'private',
  isMaster = false,
  isActive = false,
  parentId,
  onView,
  onActions,
}: ResumeCardProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handleCardClick = () => {
    onView?.();
  };

  const getPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case 'public': return <Globe className="w-3 h-3" />;
      case 'recruiter_only': return <Users className="w-3 h-3" />;
      case 'private': return <Lock className="w-3 h-3" />;
      case 'draft': return <Edit className="w-3 h-3" />;
      default: return <Lock className="w-3 h-3" />;
    }
  };

  const getPrivacyText = (privacy: string) => {
    switch (privacy) {
      case 'public': return 'Public';
      case 'recruiter_only': return 'Recruiter Only';
      case 'private': return 'Private';
      case 'draft': return 'Draft';
      default: return 'Private';
    }
  };

  const getPrivacyColor = (privacy: string) => {
    switch (privacy) {
      case 'public': return 'bg-green-100 text-green-800';
      case 'recruiter_only': return 'bg-blue-100 text-blue-800';
      case 'private': return 'bg-gray-100 text-gray-800';
      case 'draft': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="group cursor-pointer hover:shadow-lg transition-all duration-300 border hover:border-primary/30 overflow-hidden">
      <CardContent className="p-0">
        {/* Header with Name and Date */}
        <div className="p-4 border-b border-border bg-muted/30" onClick={handleCardClick}>
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">NAME</p>
                <h3 className="font-bold text-lg text-foreground leading-tight">{name}</h3>
                {title && (
                  <p className="text-sm text-muted-foreground mt-1">{title}</p>
                )}

                {/* Status badges */}
                <div className="flex items-center gap-2 mt-2">
                  {isActive && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                      <Target className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  )}
                  {isMaster && (
                    <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                      <Star className="w-3 h-3 mr-1" />
                      Master
                    </Badge>
                  )}
                  {parentId && (
                    <Badge variant="outline" className="text-xs">
                      <Copy className="w-3 h-3 mr-1" />
                      Variation
                    </Badge>
                  )}
                  <Badge className={`text-xs ${getPrivacyColor(privacy)}`}>
                    {getPrivacyIcon(privacy)}
                    <span className="ml-1">{getPrivacyText(privacy)}</span>
                  </Badge>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                Resume
              </Badge>
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>CREATED</span>
                </div>
                <span className="font-medium text-foreground">{formatDate(createdAt)}</span>
              </div>

              {views > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="w-3 h-3" />
                  <span>{views} views</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details Section */}
        <div className="p-4 bg-primary text-primary-foreground" onClick={handleCardClick}>
          <div className="space-y-3">
            <h4 className="font-bold text-lg">Professional Summary</h4>
            <div>
              <p className="text-sm leading-relaxed opacity-95 line-clamp-3">
                {summary}
              </p>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 flex items-center justify-between bg-background">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onView?.();
            }}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            View
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onActions?.();
            }}
          >
            Actions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
