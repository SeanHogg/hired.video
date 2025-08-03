import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { CompanyMetadata, CompanyWithOwnership } from '@/types/company';
import { useAuth } from '@/lib/auth';
import { 
  MapPin, 
  Users, 
  Eye, 
  Briefcase,
  UserCheck,
  Edit,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface CompanyCardProps {
  company: CompanyMetadata | CompanyWithOwnership;
  showOwnership?: boolean;
  onTrack?: (companyId: string) => void;
  onUntrack?: (companyId: string) => void;
}

export default function CompanyCard({ company, showOwnership = false, onTrack, onUntrack }: CompanyCardProps) {
  const { user } = useAuth();

  // Early return if company is undefined
  if (!company) {
    return null;
  }

  const ownership = 'ownership' in company ? company.ownership : undefined;
  const isOwned = ownership === 'owned' || (!ownership && (company.userId === user?.id || company.teamMembers?.includes(user?.id || '')));
  const isTracked = ownership === 'tracked';
  const canEdit = isOwned;
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'onboarding':
        return 'bg-blue-100 text-blue-800';
      case 'draft':
        return 'bg-orange-100 text-orange-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return null;
      case 'private':
        return <Eye className="h-3 w-3" />;
      case 'draft':
        return <Edit className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getOnboardingStatus = () => {
    if (company.status === 'draft' || company.status === 'onboarding') {
      const progress = company.onboardingProgress || 0;
      return {
        show: true,
        progress,
        message: progress === 100 ? 'Ready to publish' : `${progress}% complete`
      };
    }
    return { show: false, progress: 0, message: '' };
  };

  const onboardingStatus = getOnboardingStatus();

  return (
    <Card className="hover:shadow-lg transition-shadow relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {/* Company Logo */}
            <Avatar className="w-12 h-12 flex-shrink-0">
              <AvatarImage src={company.logo} alt={company.name} />
              <AvatarFallback className="text-sm">
                {company.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Company Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-lg hover:text-primary truncate">
                  <Link to={`/companies/${company.id}`}>
                    {company.name}
                  </Link>
                </CardTitle>
                {showOwnership && isTracked && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 flex-shrink-0">
                    <UserCheck className="h-3 w-3 mr-1" />
                    Following
                  </Badge>
                )}
                {canEdit && (company.status === 'draft' || company.status === 'onboarding') && (
                  <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 flex-shrink-0">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Setup Required
                  </Badge>
                )}
              </div>
              
              {company.tagline && (
                <CardDescription className="text-sm mb-2 line-clamp-1">
                  {company.tagline}
                </CardDescription>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  <span>{company.industry}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{company.size}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>{company.location}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status and Visibility */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="secondary" className={getStatusColor(company.status)}>
              {company.status}
            </Badge>
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
      </CardHeader>
      
      <CardContent>
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

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button asChild size="sm" className="flex-1">
              <Link to={`/companies/${company.id}`}>
                View Company
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
            
            {canEdit ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`/companies/edit/${company.id}`}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Link>
              </Button>
            ) : (
              !isOwned && user && (
                <div>
                  {isTracked ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onUntrack?.(company.id)}
                    >
                      <BookmarkCheck className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onTrack?.(company.id)}
                    >
                      <Bookmark className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )
            )}
          </div>

          {/* Quick Actions for Jobs */}
          {company.activeJobCount > 0 && (
            <div className="pt-2 border-t">
              <Button asChild variant="ghost" size="sm" className="w-full text-xs">
                <Link to={`/jobs?company=${encodeURIComponent(company.name)}`}>
                  View {company.activeJobCount} Open Position{company.activeJobCount !== 1 ? 's' : ''}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
