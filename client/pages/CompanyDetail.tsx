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
  DollarSign,
  CheckCircle,
  AlertCircle,
  Clock,
  Star,
  Linkedin,
  Twitter,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AuthOverlay from "@/components/AuthOverlay";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
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
import { Separator } from "@/components/ui/separator";
import { companyService } from "@/lib/services/company-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: boolean;
  }>({
    overview: true,
    culture: true,
    benefits: false,
    locations: false,
    onboarding: true,
  });

  const [company, setCompany] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTracked, setIsTracked] = useState(false);

  // Fetch company data
  useEffect(() => {
    const fetchCompany = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null);
        const companyData = await companyService.getCompanyById(id);
        setCompany(companyData);
      } catch (err) {
        console.error("Failed to fetch company:", err);
        setError("Failed to load company. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompany();
  }, [id]);

  const isOwner = user && company && company.userId === user.id;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleTrackCompany = async () => {
    if (!isAuthenticated || !company) {
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
    } catch (err) {
      console.error("Failed to update company tracking:", err);
    }
  };

  const handleOnboardingTaskToggle = (taskId: string, completed: boolean) => {
    // TODO: Implement onboarding task API when available
    console.log("Onboarding task toggle:", taskId, completed);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16">
            <div className="pt-8 pb-16 px-4 sm:px-6 lg:px-8">
              <div className="max-w-7xl mx-auto">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-64 bg-gray-200 rounded mb-6"></div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="h-32 bg-gray-200 rounded"></div>
                      <div className="h-32 bg-gray-200 rounded"></div>
                    </div>
                    <div className="space-y-6">
                      <div className="h-48 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
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
          <Footer />
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className={`pt-16 ${!isAuthenticated ? "relative" : ""}`}>
          {!isAuthenticated && (
            <AuthOverlay contentType="company" title={company?.data.name} />
          )}
          <div className="max-w-6xl mx-auto p-6">
            {/* Back Button */}
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate("/companies")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Companies
              </Button>
            </div>

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
                            <CardTitle className="text-2xl">
                              {company.data.name}
                            </CardTitle>
                            <Badge className={getStatusColor(company.status)}>
                              {company.status}
                            </Badge>
                          </div>
                          {company.data.tagline && (
                            <CardDescription className="text-lg mb-2">
                              {company.data.tagline}
                            </CardDescription>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              <span>{company.data.industry}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{company.data.size} employees</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>
                                {company.data.headquarters.city},{" "}
                                {company.data.headquarters.state}
                              </span>
                            </div>
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
                              {isTracked ? (
                                <>
                                  <BookmarkCheck className="h-4 w-4 mr-2" />
                                  Following
                                </>
                              ) : (
                                <>
                                  <Bookmark className="h-4 w-4 mr-2" />
                                  Follow
                                </>
                              )}
                            </Button>
                          )}
                          <Button variant="outline" size="icon">
                            <Share className="h-4 w-4" />
                          </Button>
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
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{company.views}</div>
                            <div className="text-xs text-muted-foreground">
                              Profile Views
                            </div>
                          </div>
                        </div>
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
                            company?.status !== "active" && (
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
                    <p className="whitespace-pre-line text-sm leading-relaxed">
                      {company.data.description}
                    </p>

                    {company.data.mission && (
                      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-medium text-blue-900 mb-2">
                          Our Mission
                        </h4>
                        <p className="text-sm text-blue-800">
                          {company.data.mission}
                        </p>
                      </div>
                    )}

                    {company.data.vision && (
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
                {(company.data.culture.length > 0 ||
                  company.data.values?.length > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Culture & Values</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {company.data.culture.length > 0 && (
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
                {company.data.technologies.length > 0 && (
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

                    {company.data.perks.length > 0 && (
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

                    {company.data.benefits.other &&
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
                    {company.data.contact.website && (
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

                    {company.data.contact.email && (
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

                    {company.data.contact.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {company.data.contact.phone}
                        </span>
                      </div>
                    )}

                    {company.data.contact.linkedin && (
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

                    {company.data.contact.twitter && (
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
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Profile Views
                      </span>
                      <span className="font-medium">{company.views}</span>
                    </div>
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

                {/* Locations */}
                {company.data.locations &&
                  company.data.locations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Locations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <div className="text-sm font-medium">
                                Headquarters
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {company.data.headquarters.city},{" "}
                                {company.data.headquarters.state}
                              </div>
                            </div>
                          </div>

                          {company.data.locations.map((location, index) => (
                            <div key={index} className="flex items-start gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div className="text-sm text-muted-foreground">
                                {location.city}, {location.state}
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
          <Footer />
        </div>
      </div>
    </div>
  );
}
