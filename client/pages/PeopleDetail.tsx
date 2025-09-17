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
  MessageCircle,
  UserPlus,
  ExternalLink,
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Award,
  CheckCircle,
  Clock,
  Star,
  Linkedin,
  Github,
  X,
  Send,
  Loader2,
  FileText,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { userService, type UserProfile } from "@/lib/services/user-service";
import { resumeService } from "@/lib/services/resume-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { useLocation } from "react-router-dom";
import { useSEO, generateStructuredData } from "@/lib/seo";

import ResumeCard from "@/components/ResumeCard";

export default function PeopleDetail() {
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
  const location = useLocation();

  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: boolean;
  }>({
    about: true,
    experience: true,
    education: false,
    skills: true,
    projects: false,
  });
  const [connectionMessage, setConnectionMessage] = useState("");
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  // API state management
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profile from API
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!id) {
        setError("User ID is required");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Try to determine if the ID is a UUID or a slug
        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          );

        let profile: UserProfile;
        if (isUUID) {
          // Use getUserById for UUIDs
          profile = await userService.getUserById(id);
        } else {
          // Try getUserBySlug for non-UUID strings, fallback to getUserById
          try {
            profile = await userService.getUserBySlug(id);
          } catch (slugError) {
            // If slug lookup fails, try as ID (API might accept both)
            profile = await userService.getUserById(id);
          }
        }

        setUserProfile(profile);
      } catch (err) {
        console.error("Failed to load user profile:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load user profile",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadUserProfile();
  }, [id]);

  // For backward compatibility with existing code, create a person object
  // that matches the expected structure from mock data
  const person = userProfile
    ? {
        id: userProfile.id,
        slug:
          userProfile.slug ||
          `${userProfile.firstName}-${userProfile.lastName}`
            .toLowerCase()
            .replace(/\s+/g, "-"),
        role: userProfile.role, // Add role property for proper role display
        data: {
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          avatar: userProfile.profilePicture,
          headline: `${getRoleDisplayLabel(userProfile.role)} | ${userProfile.location || "Remote"}`,
          summary:
            userProfile.bio ||
            `${userProfile.firstName} ${userProfile.lastName} is a ${getRoleDisplayLabel(userProfile.role)} professional.`,
          location: {
            city: userProfile.location?.split(",")[0]?.trim() || "",
            state: userProfile.location?.split(",")[1]?.trim() || "",
            country: "USA",
            remote: true,
          },
          contact: {
            email: userProfile.email,
            website: userProfile.website,
            linkedin: userProfile.linkedIn,
            github: userProfile.github,
          },
          experience: [], // TODO: Add experience data when available from API
          education: [], // TODO: Add education data when available from API
          skills:
            userProfile.skills?.map((skill) => ({
              name: skill,
              level: "Intermediate" as const,
              endorsed: false,
            })) || [],
          projects: [], // TODO: Add projects data when available from API
          openToWork: userProfile.openToWork || false,
          openToOpportunities: ["full-time"],
        },
        createdAt: userProfile.createdAt,
        updatedAt: userProfile.updatedAt,
      }
    : null;

  // For now, use mock data for tracking and connections until API is available
  const isTracked = false; // TODO: Implement with real API
  const [connectionStatus] = useState<
    "none" | "pending_received" | "pending_sent" | "connected"
  >("none"); // TODO: Implement with real API
  const isOwnProfile = user && userProfile && userProfile.id === user.id;

  // Check if person has an active public resume and fetch it
  const [hasActivePublicResume, setHasActivePublicResume] = useState(false);
  const [activePublicResume, setActivePublicResume] = useState<any>(null);
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!userProfile?.id) {
        setHasActivePublicResume(false);
        setActivePublicResume(null);
        return;
      }
      try {
        const list = await resumeService.getPublicResumes(1, 20);
        if (!isMounted) return;

        // Find this user's public resumes
        const userPublicResumes = (list.items ?? []).filter(
          (r) => r.userId === userProfile.id && r.isPublic,
        );

        if (userPublicResumes.length > 0) {
  // SEO: when profile loads, update title/description and structured data
  useEffect(() => {
    if (!userProfile) return;
    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();
    const title = `${fullName} | ${getRoleDisplayLabel(userProfile.role)} | MyVideoResu.me`;
    const description = userProfile.bio || `${fullName} is a ${getRoleDisplayLabel(userProfile.role)}.`;
    useSEO(location.pathname, {
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      structuredData: generateStructuredData.person({
        name: fullName,
        title: getRoleDisplayLabel(userProfile.role),
        bio: userProfile.bio,
        avatar: userProfile.profilePicture,
        id: userProfile.id,
      }),
    });
  }, [userProfile, location.pathname]);

          // Find active resume or use the first public one
          const activeResume = userPublicResumes.find(r => (r as any).isActive) || userPublicResumes[0];
          setActivePublicResume(activeResume);
          setHasActivePublicResume(true);
        } else {
          setHasActivePublicResume(false);
          setActivePublicResume(null);
        }
      } catch {
        if (isMounted) {
          setHasActivePublicResume(false);
          setActivePublicResume(null);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [userProfile?.id]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleTrackPerson = () => {
    if (!isAuthenticated || !userProfile) {
      return;
    }
    // TODO: Implement with real API
    console.log("Track person:", userProfile.id);
  };

  const handleSendConnectionRequest = async () => {
    if (!isAuthenticated || !userProfile) {
      return;
    }

    try {
      await userService.sendConnectionRequest({
        toUserId: userProfile.id,
        message: connectionMessage,
      });
      setShowConnectionDialog(false);
      setConnectionMessage("");
      // TODO: Update connection status in state
    } catch (error) {
      console.error("Failed to send connection request:", error);
    }
  };

  const handleAcceptConnection = async () => {
    if (!isAuthenticated || !userProfile) {
      return;
    }
    // TODO: Implement with real API
    console.log("Accept connection from:", userProfile.id);
  };

  const handleRejectConnection = async () => {
    if (!isAuthenticated || !userProfile) {
      return;
    }
    // TODO: Implement with real API
    console.log("Reject connection from:", userProfile.id);
  };

  const handleMessage = () => {
    // Navigate to messaging or open message modal
    console.log("Message person:", userProfile?.id);
  };

  // Loading state
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
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-4">Loading Profile...</h1>
              <p className="text-muted-foreground">
                Please wait while we fetch the user profile.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !person) {
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
              <Alert className="mb-6">
                <AlertDescription>
                  {error ||
                    "The profile you're looking for doesn't exist or has been"}
                </AlertDescription>
              </Alert>
              <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
              <p className="text-muted-foreground mb-6">
                The profile you're looking for doesn't exist or has been
                removed.
              </p>
              <Button asChild>
                <Link to="/people">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to People
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
      case "looking":
        return "bg-blue-100 text-blue-800";
      case "busy":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const currentPosition = person.data.experience.find((exp) => exp.isCurrent);

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
            <AuthOverlay
              contentType="person"
              title={
                person?.data.firstName && person?.data.lastName
                  ? `${person.data.firstName} ${person.data.lastName}`
                  : person?.data.firstName || person?.data.lastName || "User Profile"
              }
            />
          )}
          <div className="max-w-6xl mx-auto p-6">
            {/* Back Button */}
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate("/people")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to People
              </Button>
            </div>

            {/* Profile Header */}
            <div className="mb-8">
              <Card>
                <CardHeader className="pb-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Profile Avatar */}
                    <div className="flex-shrink-0">
                      <Avatar className="w-32 h-32">
                        <AvatarImage
                          src={person.data.avatar}
                          alt={`${person.data.firstName} ${person.data.lastName}`}
                        />
                        <AvatarFallback className="text-4xl">
                          {person.data.firstName.charAt(0)}
                          {person.data.lastName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Profile Info */}
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h1 className="text-3xl font-bold">
                              {person.data.firstName && person.data.lastName
                                ? `${person.data.firstName} ${person.data.lastName}`
                                : person.data.firstName || person.data.lastName || "User"}
                            </h1>
                            {(person as any).isVerified && (
                              <CheckCircle className="h-6 w-6 text-blue-600" />
                            )}
                            {(person as any).isPremium && (
                              <Star className="h-6 w-6 text-yellow-500" />
                            )}
                          </div>
                          <CardDescription className="text-xl mb-3">
                            {person.data.headline}
                          </CardDescription>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              <span>
                                {getRoleDisplayLabel(person?.role || "JobSeeker")}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>
                                {person.data.location.remote
                                  ? "Remote"
                                  : `${person.data.location.city}, ${person.data.location.state}`}
                              </span>
                            </div>
                          </div>
                          {currentPosition && (
                            <div className="flex items-center gap-2 text-sm">
                              <Briefcase className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {currentPosition.title} at{" "}
                                {currentPosition.company}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            className={getStatusColor(
                              (person as any).status || "active",
                            )}
                          >
                            {(person as any).status || "active"}
                          </Badge>
                          {person.data.openToWork && (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700"
                            >
                              Open to Work
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isOwnProfile && user && (
                        <div className="flex items-center gap-3 mb-4">
                          {connectionStatus === "pending_received" ? (
                            <div className="flex gap-2">
                              <Button onClick={handleAcceptConnection}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Accept Connection
                              </Button>
                              <Button
                                variant="outline"
                                onClick={handleRejectConnection}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Decline
                              </Button>
                            </div>
                          ) : connectionStatus === "pending_sent" ? (
                            <Button variant="outline" disabled>
                              <Clock className="h-4 w-4 mr-2" />
                              Connection Pending
                            </Button>
                          ) : connectionStatus === "connected" ? (
                            <Button onClick={handleMessage}>
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Message
                            </Button>
                          ) : (
                            <Dialog
                              open={showConnectionDialog}
                              onOpenChange={setShowConnectionDialog}
                            >
                              <DialogTrigger asChild>
                                <Button>
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Connect
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Send Connection Request
                                  </DialogTitle>
                                  <DialogDescription>
                                    Add a personal message to your connection
                                    request to {person.data.firstName}.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <Textarea
                                    placeholder="I'd love to connect and expand my professional network..."
                                    value={connectionMessage}
                                    onChange={(e) =>
                                      setConnectionMessage(e.target.value)
                                    }
                                    rows={3}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        setShowConnectionDialog(false)
                                      }
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={handleSendConnectionRequest}
                                    >
                                      <Send className="h-4 w-4 mr-2" />
                                      Send Request
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}

                          <Button variant="outline" onClick={handleTrackPerson}>
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

                          <Button variant="outline" size="icon">
                            <Share className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      {/* Own Profile Edit Button */}
                      {isOwnProfile && (
                        <div className="mb-4">
                          <Button asChild>
                            <Link to="/profile">
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Profile
                            </Link>
                          </Button>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-primary">
                            {(person as any).connectionCount || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Connections
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-primary">
                            {(person as any).followerCount || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Followers
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-primary">
                            {(person as any).profileViews || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Profile Views
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
                {/* About Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line leading-relaxed">
                      {person.data.summary}
                    </p>
                  </CardContent>
                </Card>

                {/* Resume Details - Only show if user has active public resume */}
                {hasActivePublicResume ? (
                  <>
                    {/* Experience Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          Experience
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          {/* Active Public Resume Card */}
                          {activePublicResume && (
                            <div className="mb-6">
                              <div className="flex items-center gap-2 mb-3">
                                <FileText className="h-4 w-4 text-primary" />
                                <h3 className="font-medium text-sm">Professional Resume</h3>
                              </div>
                              <div className="max-w-md">
                                <ResumeCard
                                  id={activePublicResume.Id || activePublicResume.id}
                                  name={activePublicResume.Name || activePublicResume.name || "Resume"}
                                  title={activePublicResume.title}
                                  summary={activePublicResume.Description || activePublicResume.description || "Professional resume"}
                                  createdAt={activePublicResume.CreationDateTimeFormatted || activePublicResume.createdAt || new Date().toISOString()}
                                  views={activePublicResume.Views || activePublicResume.views || 0}
                                  privacy="public"
                                  isMaster={activePublicResume.IsMaster || (activePublicResume as any).isMaster || false}
                                  isActive={(activePublicResume as any).isActive || false}
                                  ownership="tracked"
                                  onView={() => {
                                    const resumeId = activePublicResume.Id || activePublicResume.id;
                                    window.open(`/resumes/${resumeId}`, '_blank');
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {person.data.experience.map((exp, index) => (
                            <div key={index} className="flex gap-4">
                              <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                                  <Building2 className="h-6 w-6 text-primary" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <h3 className="font-semibold text-lg">
                                      {exp.title}
                                    </h3>
                                    <p className="text-muted-foreground">
                                      {exp.company}
                                    </p>
                                    {exp.location && (
                                      <p className="text-sm text-muted-foreground">
                                        {exp.location}
                                      </p>
                                    )}
                                  </div>
                                  {exp.isCurrent && (
                                    <Badge
                                      variant="outline"
                                      className="bg-green-50 text-green-700"
                                    >
                                      Current
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {exp.startDate} - {exp.endDate || "Present"}
                                </p>
                                {exp.description && (
                                  <p className="text-sm mb-3">
                                    {exp.description}
                                  </p>
                                )}
                                {exp.skills && exp.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {exp.skills.map((skill, skillIndex) => (
                                      <Badge
                                        key={skillIndex}
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {skill}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Education Section */}
                    {person.data.education.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <GraduationCap className="h-5 w-5" />
                            Education
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {person.data.education.map((edu, index) => (
                              <div key={index} className="flex gap-4">
                                <div className="flex-shrink-0">
                                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                                    <GraduationCap className="h-6 w-6 text-blue-600" />
                                  </div>
                                </div>
                                <div>
                                  <h3 className="font-semibold">
                                    {edu.degree} in {edu.field}
                                  </h3>
                                  <p className="text-muted-foreground">
                                    {edu.institution}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {edu.startDate} - {edu.endDate || "Present"}
                                  </p>
                                  {edu.gpa && (
                                    <p className="text-sm text-muted-foreground">
                                      GPA: {edu.gpa}
                                    </p>
                                  )}
                                  {edu.description && (
                                    <p className="text-sm mt-2">
                                      {edu.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Skills Section */}
                    {person.data.skills.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Award className="h-5 w-5" />
                            Skills & Expertise
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {person.data.skills.map((skill, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                              >
                                <div>
                                  <div className="font-medium">
                                    {skill.name}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {skill.level}
                                    {(skill as any).yearsOfExperience &&
                                      ` • ${(skill as any).yearsOfExperience} years`}
                                  </div>
                                </div>
                                {(skill as any).endorsements && (
                                  <Badge variant="outline" className="text-xs">
                                    {(skill as any).endorsements} endorsements
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Projects Section */}
                    {person.data.projects.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Projects</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {person.data.projects.map((project, index) => (
                              <div
                                key={index}
                                className="border rounded-lg p-4"
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-semibold">
                                    {project.name}
                                  </h3>
                                  {project.url && (
                                    <Button variant="outline" size="sm" asChild>
                                      <a
                                        href={project.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {project.startDate} -{" "}
                                  {project.endDate || "Present"}
                                  {project.role && ` • ${project.role}`}
                                </p>
                                <p className="text-sm mb-3">
                                  {project.description}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {project.technologies.map(
                                    (tech, techIndex) => (
                                      <Badge
                                        key={techIndex}
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {tech}
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  /* No Public Resume Message */
                  <Card>
                    <CardContent className="text-center py-8">
                      <div className="flex justify-center mb-4">
                        <div className="p-3 bg-muted rounded-full">
                          <Briefcase className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                      <h3 className="font-semibold text-lg mb-2">
                        Professional Details Private
                      </h3>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto">
                        This user hasn't made their detailed professional
                        information public yet. You can still connect with them
                        and see their basic profile information.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`mailto:${person.data.contact.email}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {person.data.contact.email}
                      </a>
                    </div>

                    {(person.data.contact as any).phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {(person.data.contact as any).phone}
                        </span>
                      </div>
                    )}

                    {person.data.contact.website && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={person.data.contact.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          {person.data.contact.website.replace(
                            /^https?:\/\//,
                            "",
                          )}
                        </a>
                      </div>
                    )}

                    {person.data.contact.linkedin && (
                      <div className="flex items-center gap-3">
                        <Linkedin className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={person.data.contact.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          LinkedIn
                        </a>
                      </div>
                    )}

                    {person.data.contact.github && (
                      <div className="flex items-center gap-3">
                        <Github className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={person.data.contact.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          GitHub
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Additional Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(person.data as any).languages &&
                      (person.data as any).languages.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">
                            Languages
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {(person.data as any).languages.map(
                              (language: any, index: number) => (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {language}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    {(person.data as any).interests &&
                      (person.data as any).interests.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">
                            Interests
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {(person.data as any).interests.map(
                              (interest: any, index: number) => (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {interest}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    <Separator />

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Member since
                        </span>
                        <span>
                          {person.createdAt &&
                          !isNaN(new Date(person.createdAt).getTime())
                            ? new Date(person.createdAt).toLocaleDateString()
                            : "Unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Last active
                        </span>
                        <span>
                          {(() => {
                            const lastActive =
                              (person as any).lastActiveAt || person.updatedAt;
                            return lastActive &&
                              !isNaN(new Date(lastActive).getTime())
                              ? new Date(lastActive).toLocaleDateString()
                              : "Unknown";
                          })()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Opportunity Preferences (if open to work) */}
                {person.data.openToWork && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-green-700">
                        Open to Opportunities
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {person.data.openToOpportunities.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">
                            Opportunity Types
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {person.data.openToOpportunities.map(
                              (type, index) => (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className="text-xs capitalize"
                                >
                                  {type.replace("-", " ")}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {(person.data as any).preferredRoles &&
                        (person.data as any).preferredRoles.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">
                              Preferred Roles
                            </h4>
                            <div className="space-y-1">
                              {(person.data as any).preferredRoles.map(
                                (role: any, index: number) => (
                                  <div
                                    key={index}
                                    className="text-xs text-muted-foreground"
                                  >
                                    • {role}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {(person.data as any).salaryExpectation && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">
                            Salary Expectation
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {(person.data as any).salaryExpectation.min &&
                            (person.data as any).salaryExpectation.max
                              ? `$${((person.data as any).salaryExpectation.min / 1000).toFixed(0)}k - $${((person.data as any).salaryExpectation.max / 1000).toFixed(0)}k ${(person.data as any).salaryExpectation.currency}`
                              : "Negotiable"}
                          </p>
                        </div>
                      )}
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
