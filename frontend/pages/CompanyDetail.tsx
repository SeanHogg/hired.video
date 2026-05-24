import {
  MapPin,
  Globe,
  Mail,
  Phone,
  Edit,
  Share,
  Bookmark,
  BookmarkCheck,
  Users,
  Eye,
  Calendar,
  Building2,
  TrendingUp,
  ExternalLink,
  ArrowLeft,
  Briefcase,
  Award,
  Target,
  CheckCircle,
  Star,
  Linkedin,
  Twitter,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link , useLocation } from "react-router-dom";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

import { companyService } from "@/lib/services/company-service";
import type { CompanyProfile } from "@/lib/services/company-service";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { useAuth } from "@/lib/auth";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { useArtifactViewTracking } from "@/hooks/use-artifact-view-tracking";
import ArtifactDetailsSheet from "@/components/shared/ArtifactDetailsSheet";
import { useSEO, generateStructuredData } from "@/lib/seo";
import { toast } from "@/components/ui/use-toast";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import EntityHubTabStrip from "@/components/EntityHubTabStrip";
import { entityBreadcrumb } from "@/components/entity-breadcrumb";

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const location = useLocation();



  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTracked, setIsTracked] = useState(false);

  useArtifactViewTracking({
    artifactKind: "company",
    artifactId: (company as any)?.data?.id ?? null,
    ownerUserId: (company as any)?.data?.ownerUserId ?? null,
  });

  // Fetch company data
  useEffect(() => {
    const fetchCompany = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null);
        const companyData = await companyService.getCompanyProfileById(id);
        setCompany(companyData);
      } catch (err) {
        console.error("Failed to load company:", err);
        setError("Failed to load company. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompany();
  }, [id]);

  // SEO: compute SEO data when company loads
  const seoData = useMemo(() => {
    if (!company) return null;
    const title = `${company.data.name} Company Profile — hired.video`;
    const description =
      company.data.tagline ||
      (company.data.description ? company.data.description.slice(0, 160) : "Company profile on hired.video");
    return {
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      // Per-company OG card — server-rendered SVG with the cached
      // star rating + review count baked in. Cached at the edge for
      // an hour; updated automatically whenever the rating changes
      // because the URL is stable but the SVG content reflects the
      // current company_profiles row.
      ogImage: `/api/og/companies/${company.id}`,
      structuredData: generateStructuredData.organization({
        name: company.data.name,
        description: company.data.description,
        website: company.data.contact?.website,
        logo: company.data.logo,
        address: company.data.headquarters && company.data.headquarters.city && company.data.headquarters.state
          ? `${company.data.headquarters.city}, ${company.data.headquarters.state}`
          : undefined,
      }),
    };
  }, [company]);

  // Apply SEO data
  useSEO(location.pathname, seoData || {});

  // Team membership is folded into useEntityOwnership so the edit
  // affordances on this page agree with every other entity surface
  // (CompanyCard, EntityVideos, etc.).
  const { isOwner } = useEntityOwnership({
    ownerUserId: company?.userId,
    extraOwnerPredicates: [
      (viewerUserId) => company?.teamMembers?.includes(viewerUserId) ?? false,
    ],
  });



  const handleTrackCompany = async () => {
    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      navigate("/login", {
        state: {
          from: `/companies/${id}`,
          message: "Please log in to follow companies",
        },
      });
      return;
    }

    if (!company) {
      return;
    }

    try {
      if (isTracked) {
        await companyService.unfollowCompany(company.id);
        setIsTracked(false);
      } else {
        await companyService.followCompany(company.id);
        setIsTracked(true);
      }
    } catch {
      // Error handling could be improved with user feedback
    }
  };

  const handleOnboardingTaskToggle = (_taskId: string, _completed: boolean) => {
    // TODO: Implement onboarding task API when available
    // Placeholder for onboarding task toggle functionality
  };

  if (isLoading) {
    return (
      <AppShell bgClassName="bg-background">
<div className="pt-16">
            <div className="pt-8 pb-16 px-4 sm:px-6 lg:px-8">
              <div className="max-w-7xl mx-auto">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
                  <div className="h-64 bg-gray-200 rounded mb-6" />
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="h-32 bg-gray-200 rounded" />
                      <div className="h-32 bg-gray-200 rounded" />
                    </div>
                    <div className="space-y-6">
                      <div className="h-48 bg-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
</AppShell>
  );
  }

  if (error || !company) {
    return (
      <AppShell bgClassName="bg-background">
<div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">Company Not Found</h1>
              <p className="text-muted-foreground mb-6">
                The company you're looking for doesn't exist or has been
                removed.
              </p>
              <Button asChild>
                <Link to="/companies">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Companies
                </Link>
              </Button>
            </div>
          </div>
</AppShell>
  );
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

  const completedTasks =
    company?.onboardingTasks?.filter((task) => task.completed).length || 0;
  const totalTasks = company?.onboardingTasks?.length || 1;
  const onboardingProgress = Math.round((completedTasks / totalTasks) * 100);

  const companyTabs = entityBreadcrumb(
    { label: "Companies", to: "/companies", icon: Building2 },
    company.data.name,
  );

  return (
    <AppShell bgClassName="bg-background">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          {/* Hub-level tab strip — keeps the Companies / Following /
              My Companies / Team context visible across detail pages. */}
          <EntityHubTabStrip entity="company" />
          <PageHeader tabs={companyTabs} activeTabKey="current" />

            {/* Company Header */}
            <div className="mb-8">
              <Card>
                <CardHeader className="pb-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Company Logo */}
                    <div className="flex-shrink-0">
                      <Avatar className="w-24 h-24">
                        <AvatarImage
                          src={company.data.logo}
                          alt={company.data.name}
                        />
                        <AvatarFallback className="text-2xl">
                          {company.data.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Company Info */}
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h1 className="text-2xl font-bold">
                              {company.data.name}
                            </h1>
                            <Badge className={getStatusColor(company.status)}>
                              {String(company.status)}
                            </Badge>
                            <ArtifactDetailsSheet
                              permission={{
                                kind: "company",
                                entity: {
                                  id: (company as any).data?.id ?? "",
                                  ownerUserId: (company as any).data?.ownerUserId ?? null,
                                },
                              }}
                              title={company.data.name}
                              chips={
                                <Badge variant="secondary">{String(company.status)}</Badge>
                              }
                              activity={{
                                viewCount: (company as any).viewCount ?? undefined,
                                createdAt: (company as any).createdAt,
                                updatedAt: (company as any).updatedAt,
                              }}
                            />
                          </div>
                          {company.data.tagline && (
                            <CardDescription className="text-lg mb-2">
                              {company.data.tagline}
                            </CardDescription>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {company.data.industry && company.data.industry !== "Not specified" && (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-4 w-4" />
                                <span>{company.data.industry}</span>
                              </div>
                            )}
                            {company.data.size && company.data.size !== "Not specified" && (
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                <span>{company.data.size} employees</span>
                              </div>
                            )}
                            {(company.data.headquarters?.city || company.data.headquarters?.state) && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                <span>
                                  {[company.data.headquarters.city, company.data.headquarters.state]
                                    .filter(Boolean)
                                    .join(", ") || "Location not specified"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isOwner ? (
                            <Button asChild>
                              <Link to={`/companies/edit/${company.id}`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Company
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={handleTrackCompany}
                            >
                              {isAuthenticated ? (
                                isTracked ? (
                                  <>
                                    <BookmarkCheck className="h-4 w-4 mr-2" />
                                    Following
                                  </>
                                ) : (
                                  <>
                                    <Bookmark className="h-4 w-4 mr-2" />
                                    Follow
                                  </>
                                )
                              ) : (
                                <>
                                  <Bookmark className="h-4 w-4 mr-2" />
                                  Follow Company
                                </>
                              )}
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => {
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
                                  // Fallback for older browsers
                                  prompt("Copy this link:", url);
                                });
                            }}
                          >
                            <Share className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" aria-label="More actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <AddToListMenu
                                entityType="company"
                                entityId={company.id}
                                entityLabel={company.data.name}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {company.activeJobCount}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Open Jobs
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <div>
                            <div className="font-medium">
                              {company.reviewAvgOverall != null
                                ? `${company.reviewAvgOverall.toFixed(1)} (${company.reviewCount ?? 0})`
                                : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Reviews
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {company.followers}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Followers
                            </div>
                          </div>
                        </div>
                        {isOwner && (
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{company.views}</div>
                              <div className="text-xs text-muted-foreground">
                                Profile Views
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {company.data.founded || "N/A"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Founded
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Onboarding Tasks (Only for owners with incomplete onboarding) */}
                {isOwner &&
                  (company?.status === "draft" ||
                    company?.status === "onboarding") && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Target className="h-5 w-5" />
                          Complete Your Company Setup
                        </CardTitle>
                        <CardDescription>
                          Complete these tasks to make your company profile
                          public and attract talent.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Progress
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {onboardingProgress}% complete
                            </span>
                          </div>
                          <Progress
                            value={onboardingProgress}
                            className="h-2"
                          />

                          <div className="space-y-3">
                            {(company?.onboardingTasks || [])
                              .sort((a, b) => a.order - b.order)
                              .map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-start gap-3 p-3 rounded-lg border"
                                >
                                  <Checkbox
                                    checked={task.completed}
                                    onCheckedChange={(checked) =>
                                      handleOnboardingTaskToggle(
                                        task.id,
                                        Boolean(checked),
                                      )
                                    }
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h4
                                        className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}
                                      >
                                        {task.title}
                                      </h4>
                                      {task.required && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          Required
                                        </Badge>
                                      )}
                                      {task.completed && (
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {task.description}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>

                          {onboardingProgress === 100 &&
                            String(company?.status) !== "active" && (
                              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center gap-2 text-green-800">
                                  <CheckCircle className="h-5 w-5" />
                                  <span className="font-medium">
                                    Ready to Go Live!
                                  </span>
                                </div>
                                <p className="text-sm text-green-700 mt-1">
                                  Your company profile is complete and ready to
                                  be published. Your profile will become visible
                                  to job seekers.
                                </p>
                              </div>
                            )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                {/* Company Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle>About {company.data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {company.data.description ? (
                      <p className="whitespace-pre-line text-sm leading-relaxed">
                        {company.data.description}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No company description available.
                      </p>
                    )}

                    {company.data.mission && company.data.mission.trim() && (
                      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-medium text-blue-900 mb-2">
                          Our Mission
                        </h4>
                        <p className="text-sm text-blue-800">
                          {company.data.mission}
                        </p>
                      </div>
                    )}

                    {company.data.vision && company.data.vision.trim() && (
                      <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                        <h4 className="font-medium text-purple-900 mb-2">
                          Our Vision
                        </h4>
                        <p className="text-sm text-purple-800">
                          {company.data.vision}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Company Culture & Values */}
                {(company.data.culture?.length > 0 ||
                  company.data.values?.length > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Culture & Values</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {company.data.culture?.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-medium mb-3">Our Culture</h4>
                          <div className="flex flex-wrap gap-2">
                            {company.data.culture.map((item, index) => (
                              <Badge key={index} variant="outline">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {company.data.values &&
                        company.data.values.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-3">Our Values</h4>
                            <ul className="space-y-2">
                              {company.data.values.map((value, index) => (
                                <li
                                  key={index}
                                  className="flex items-start gap-2 text-sm"
                                >
                                  <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                                  <span>{value}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                )}

                {/* Technologies */}
                {company.data.technologies?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Technologies We Use</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {company.data.technologies.map((tech, index) => (
                          <Badge key={index} variant="secondary">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Benefits & Perks */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Benefits & Perks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      {Object.entries(company.data.benefits).map(
                        ([key, value]) => {
                          if (key === "other" || typeof value !== "boolean")
                            return null;
                          const label = key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase());
                          return (
                            <div key={key} className="flex items-center gap-2">
                              {value ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                              )}
                              <span
                                className={`text-sm ${value ? "" : "text-muted-foreground"}`}
                              >
                                {label}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>

                    {company.data.perks?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3">Additional Perks</h4>
                        <div className="flex flex-wrap gap-2">
                          {company.data.perks.map((perk, index) => (
                            <Badge key={index} variant="outline">
                              {perk}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {company.data.benefits?.other &&
                      company.data.benefits.other.length > 0 && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Special Benefits</h4>
                          <ul className="space-y-1">
                            {company.data.benefits.other.map(
                              (benefit, index) => (
                                <li
                                  key={index}
                                  className="text-sm text-muted-foreground"
                                >
                                  • {benefit}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                  </CardContent>
                </Card>

                {/* Reviews & Ratings */}
                <ReviewsSection
                  subjectType="company"
                  subjectId={company.id}
                  subjectName={company.data.name}
                  isOwner={!!isOwner}
                />
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Quick Actions */}
                {company.activeJobCount > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Open Positions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary mb-1">
                          {company.activeJobCount}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Open position{company.activeJobCount !== 1 ? "s" : ""}
                        </p>
                        <Button asChild className="w-full">
                          <Link
                            to={`/jobs?company=${encodeURIComponent(company.data.name)}`}
                          >
                            View All Jobs
                            <ExternalLink className="h-4 w-4 ml-2" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {company.data.contact?.website && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={company.data.contact.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          {company.data.contact.website.replace(
                            /^https?:\/\//,
                            "",
                          )}
                        </a>
                      </div>
                    )}

                    {company.data.contact?.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`mailto:${company.data.contact.email}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {company.data.contact.email}
                        </a>
                      </div>
                    )}

                    {company.data.contact?.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`tel:${company.data.contact.phone}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {company.data.contact.phone}
                        </a>
                      </div>
                    )}

                    {company.data.contact?.linkedin && (
                      <div className="flex items-center gap-3">
                        <Linkedin className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={company.data.contact.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          LinkedIn
                        </a>
                      </div>
                    )}

                    {company.data.contact?.twitter && (
                      <div className="flex items-center gap-3">
                        <Twitter className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={company.data.contact.twitter}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Twitter
                        </a>
                      </div>
                    )}

                    {/* Show empty state if no contact info */}
                    {!company.data.contact?.website && 
                     !company.data.contact?.email && 
                     !company.data.contact?.phone && 
                     !company.data.contact?.linkedin && 
                     !company.data.contact?.twitter && (
                      <p className="text-sm text-muted-foreground italic">
                        No contact information available.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Company Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle>Company Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Industry</span>
                      <span className="font-medium">
                        {company.data.industry}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Size</span>
                      <span className="font-medium">
                        {company.data.size} employees
                      </span>
                    </div>
                    {company.data.founded && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Founded</span>
                        <span className="font-medium">
                          {company.data.founded}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Followers</span>
                      <span className="font-medium">{company.followers}</span>
                    </div>
                    {isOwner && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Profile Views
                        </span>
                        <span className="font-medium">{company.views}</span>
                      </div>
                    )}
                    {company.data.financials?.fundingStage && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Funding</span>
                        <span className="font-medium capitalize">
                          {company.data.financials.fundingStage.replace(
                            "-",
                            " ",
                          )}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Headquarters Address */}
                {company.data.headquarters && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Headquarters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {company.data.headquarters.address && (
                        <div>
                          <p className="text-sm text-muted-foreground">Address</p>
                          <p className="text-sm font-medium">
                            {company.data.headquarters.address}
                          </p>
                        </div>
                      )}

                      {(company.data.headquarters.city ||
                        company.data.headquarters.state ||
                        company.data.headquarters.country) && (
                        <div>
                          <p className="text-sm text-muted-foreground">Location</p>
                          <p className="text-sm font-medium">
                            {[
                              company.data.headquarters.city,
                              company.data.headquarters.state,
                              company.data.headquarters.country,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </div>
                      )}

                      {company.data.headquarters.postalCode && (
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Postal Code
                          </p>
                          <p className="text-sm font-medium">
                            {company.data.headquarters.postalCode}
                          </p>
                        </div>
                      )}

                      {company.data.headquarters.timezone && (
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Timezone
                          </p>
                          <p className="text-sm font-medium">
                            {company.data.headquarters.timezone}
                          </p>
                        </div>
                      )}

                      {company.data.headquarters.remote && (
                        <div className="pt-2 border-t">
                          <Badge variant="secondary">Remote-first Company</Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Additional Locations */}
                {company.data.locations &&
                  company.data.locations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Additional Locations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {company.data.locations.map((location, index) => (
                            <div key={index} className="flex items-start gap-2 pb-3 border-b last:border-b-0 last:pb-0">
                              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                {location.address && (
                                  <p className="text-sm font-medium">
                                    {location.address}
                                  </p>
                                )}
                                <p className="text-sm text-muted-foreground">
                                  {[location.city, location.state, location.country]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
              </div>
            </div>
        </div>
    </AppShell>
  );
}
