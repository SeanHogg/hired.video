import {
  User,
  Briefcase,
  FileText,
  Settings,
  Share,
  Eye,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ShareModal from "@/components/ShareModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { useAuth } from "@/lib/auth";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import useDashboard from "@/hooks/dashboard/useDashboard";
import { useProfileResumeData } from "@/hooks/useProfileResumeData";
import ProfileInsights from "@/components/profile/ProfileInsights";
import { SeekerAnalyticsCard } from "@/components/dashboard/shared/SeekerAnalyticsCard";
import JobMatchesCard from "@/components/dashboard/shared/JobMatchesCard";
import UpcomingInterviewsCard from "@/components/dashboard/shared/UpcomingInterviewsCard";
import { dashboardService, type SeekerAnalytics } from "@/lib/services/dashboard-service";
import {
  formatRoleForDisplay,
  createRolePermissions,
} from "@/lib/role-utils";

// Section display components
import ProfileHeader from "@/components/profile/sections/ProfileHeader";
import AboutSection from "@/components/profile/sections/AboutSection";
import SkillsSection from "@/components/profile/sections/SkillsSection";
import ContactSidebar from "@/components/profile/sections/ContactSidebar";
import SocialProfilesSection from "@/components/profile/sections/SocialProfilesSection";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";

// Edit dialogs
import EditHeaderDialog from "@/components/profile/dialogs/EditHeaderDialog";
import EditAboutDialog from "@/components/profile/dialogs/EditAboutDialog";
import EditContactDialog from "@/components/profile/dialogs/EditContactDialog";
import EditSocialProfilesDialog from "@/components/profile/dialogs/EditSocialProfilesDialog";
import EditSkillsDialog from "@/components/profile/dialogs/EditSkillsDialog";
import EditProfessionalInfoDialog from "@/components/profile/dialogs/EditProfessionalInfoDialog";
import EditCustomUrlDialog from "@/components/profile/dialogs/EditCustomUrlDialog";

type DialogType =
  | "header"
  | "about"
  | "contact"
  | "social"
  | "skills"
  | "professional"
  | "url"
  | null;

function ProfileContent() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);

  const { user, isAuthenticated, refreshUser, impersonationSession } = useAuth();
  const { personaPreview } = usePersonaPreview();
  const { dashboardData, loading: dashboardLoading } = useDashboard();
  const { masterResume, loading: resumeLoading } = useProfileResumeData();

  // Seeker analytics — mirrors the Chrome extension's Analytics tab so the
  // numbers on /profile match what the sidepanel shows.
  const [seekerAnalytics, setSeekerAnalytics] = useState<SeekerAnalytics | null>(null);
  const [seekerAnalyticsLoading, setSeekerAnalyticsLoading] = useState(false);

  // Use the resume's saved template (if any), falling back to the default.
  // Hero is disabled on /profile — ProfileHeader already shows name, avatar,
  // contact, and share. Video resume lives in the dedicated sidebar section.
  const resumeDescriptor = useMemo<ResumeTemplateDescriptor>(() => {
    const saved = getTemplateById(masterResume?.content?.meta?.template);
    const base = saved ?? DEFAULT_DESCRIPTOR;
    return {
      ...base,
      hero: { ...base.hero, enabled: false },
    };
  }, [masterResume?.content?.meta?.template]);

  // Effective role: impersonation > persona preview > actual
  const effectiveRole =
    impersonationSession?.role ?? personaPreview ?? user?.role ?? null;

  // Refresh user data on mount
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser().catch((e) =>
        console.warn("Profile: refreshUser failed", e),
      );
    }
  }, []);

  // Load seeker analytics once the user is authenticated and viewing as a seeker.
  useEffect(() => {
    if (!isAuthenticated) return;
    const rp = createRolePermissions(
      impersonationSession?.role ?? personaPreview ?? user?.role ?? null,
    );
    if (!rp.isJobSeeker) return;
    setSeekerAnalyticsLoading(true);
    dashboardService
      .getSeekerAnalytics()
      .then(setSeekerAnalytics)
      .finally(() => setSeekerAnalyticsLoading(false));
  }, [isAuthenticated, user?.role, personaPreview, impersonationSession?.role]);

  const joinedText = (() => {
    const iso = (user as any)?.createdAt as string | undefined;
    if (!iso) return "Joined today";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Joined";
    return `Joined ${d.toLocaleString(undefined, { month: "long", year: "numeric" })}`;
  })();

  // Navigate to resume editor for resume-owned sections
  const handleEditResume = () => {
    if (masterResume?.id) {
      navigate(`/resumes/edit/${masterResume.id}`);
    } else {
      navigate("/resumes");
    }
  };

  // If user is not authenticated, show sign-in prompt
  if (!isAuthenticated || !user) {
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
            <div className="max-w-4xl mx-auto text-center py-12 sm:py-16 p-4 sm:p-6">
              <User className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-4" />
              <h1 className="text-xl sm:text-2xl font-bold mb-4">
                Sign In Required
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground mb-6">
                Please sign in to view and edit your profile.
              </p>
              <Button asChild className="min-h-[44px]">
                <Link to="/login">Sign In</Link>
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

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
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Page Header */}
            <div>
              <h1 className="text-3xl font-bold">Profile</h1>
              <p className="text-muted-foreground mt-1">
                View and manage your professional profile
              </p>
            </div>

            {/* Profile Header Card */}
            <ProfileHeader
              avatar={user.avatar}
              firstName={user.firstName || ""}
              lastName={user.lastName || ""}
              headline={user.headline}
              roleBadge={formatRoleForDisplay(effectiveRole ?? user.role)}
              subscription={user.subscription}
              email={user.email || ""}
              phone={user.phone}
              location={user.location}
              currentRole={user.currentRole}
              currentCompany={user.currentCompany}
              website={user.website}
              joinedText={joinedText}
              slug={user.slug}
              isOwner={true}
              onEditProfile={() => setActiveDialog("header")}
              onEditUrl={() => setActiveDialog("url")}
              onShare={() => setShareOpen(true)}
            />

            {/* 2-Column Layout */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* About */}
                <AboutSection
                  bio={user.bio}
                  isOwner={true}
                  onEdit={() => setActiveDialog("about")}
                />

                {/* Resume-driven sections (work, education, resume skills,
                    projects, etc.) — rendered via the shared resume template
                    engine so /profile and /resumes/:id stay visually in sync.
                    Hero is disabled; ProfileHeader already covers that. */}
                {resumeLoading ? (
                  <Card>
                    <CardContent className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                      <span className="text-muted-foreground">
                        Loading resume data...
                      </span>
                    </CardContent>
                  </Card>
                ) : masterResume ? (
                  <div className="-mx-6 [&_.max-w-6xl]:max-w-none">
                    <DeclarativeResumeRenderer
                      resume={masterResume}
                      descriptor={resumeDescriptor}
                      embedded
                      isOwner
                      onEditSection={(key) =>
                        navigate(`/resumes/edit/${masterResume.id}?section=${encodeURIComponent(key)}`)
                      }
                    />
                    <div className="px-6 mt-2 flex justify-end">
                      <Button variant="outline" size="sm" onClick={handleEditResume}>
                        Edit resume
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-10">
                      <div className="flex justify-center mb-4">
                        <div className="p-3 bg-muted rounded-full">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </div>
                      <h3 className="font-semibold text-lg mb-2">
                        No Master Resume Found
                      </h3>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                        Create a master resume to display your work experience,
                        education, skills, and projects on your profile.
                      </p>
                      <Button asChild>
                        <Link to="/resumes">Manage Resumes</Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Profile Skills & Industries (profile-level, editable here) */}
                <SkillsSection
                  profileSkills={user.skills}
                  industries={user.industries}
                  isOwner={true}
                  onEdit={() => setActiveDialog("skills")}
                  title="Profile Skills & Industries"
                />
              </div>

              {/* Sidebar — contact, socials, consolidated Profile Metrics,
                  job-seeker analytics, matches, and upcoming interviews.
                  Persona info was removed from here because the profile
                  header already shows the role/plan badge. */}
              <div className="space-y-6">
                {/* Contact */}
                <ContactSidebar
                  email={user.email}
                  phone={user.phone}
                  website={user.website}
                  isOwner={true}
                  onEdit={() => setActiveDialog("contact")}
                />

                {/* Social Profiles */}
                <SocialProfilesSection
                  linkedIn={user.linkedIn}
                  github={user.github}
                  twitter={user.twitter}
                  isOwner={true}
                  onEdit={() => setActiveDialog("social")}
                />

                {/* Visibility + consolidated Profile Metrics (content counts
                    + profile-view stats merged into one card). */}
                <ProfileInsights
                  profileStats={(dashboardData as any)?.profileStats}
                />

                {(() => {
                  const rp = createRolePermissions(effectiveRole);
                  if (!rp.isJobSeeker) return null;
                  const dd = dashboardData as any;
                  return (
                    <>
                      <SeekerAnalyticsCard
                        analytics={seekerAnalytics}
                        loading={seekerAnalyticsLoading}
                      />
                      <JobMatchesCard
                        matches={dd?.jobMatches}
                        loading={dashboardLoading}
                      />
                      <UpcomingInterviewsCard
                        interviews={dd?.upcomingInterviews}
                        loading={dashboardLoading}
                      />
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Manage your profile and career activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {(() => {
                    const rolePermissions = createRolePermissions(effectiveRole);
                    if (rolePermissions.isJobSeeker) {
                      return (
                        <>
                          <Button
                            variant="outline"
                            className="h-auto p-3 sm:p-4 flex flex-col gap-2 min-h-[80px] text-center"
                            asChild
                          >
                            <Link to="/resumes">
                              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                              <span className="text-sm sm:text-base font-medium">
                                Update Resume
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Upload or edit your resume
                              </span>
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-auto p-4 flex flex-col gap-2"
                            asChild
                          >
                            <Link to="/jobs">
                              <Briefcase className="h-6 w-6" />
                              <span className="font-medium">
                                Job Applications
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Track your applications
                              </span>
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-auto p-4 flex flex-col gap-2"
                            asChild
                          >
                            <Link to="/settings">
                              <Settings className="h-6 w-6" />
                              <span className="font-medium">
                                Account Settings
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Privacy & preferences
                              </span>
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-auto p-4 flex flex-col gap-2"
                            onClick={() => setShareOpen(true)}
                          >
                            <Share className="h-6 w-6" />
                            <span className="font-medium">Share Profile</span>
                            <span className="text-xs text-muted-foreground">
                              Get your profile link
                            </span>
                          </Button>
                        </>
                      );
                    }

                    // recruiter/employer
                    return (
                      <>
                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          asChild
                        >
                          <Link to="/jobs/create">
                            <Briefcase className="h-6 w-6" />
                            <span className="font-medium">Post a Job</span>
                            <span className="text-xs text-muted-foreground">
                              Create a new job listing
                            </span>
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          asChild
                        >
                          <Link to="/people">
                            <Eye className="h-6 w-6" />
                            <span className="font-medium">
                              Browse Candidates
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Search profiles & resumes
                            </span>
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          asChild
                        >
                          <Link to="/settings">
                            <Settings className="h-6 w-6" />
                            <span className="font-medium">
                              Account Settings
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Team & preferences
                            </span>
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          onClick={() => setShareOpen(true)}
                        >
                          <Share className="h-6 w-6" />
                          <span className="font-medium">Share Company</span>
                          <span className="text-xs text-muted-foreground">
                            Invite or share your page
                          </span>
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Share Modal */}
            <ShareModal
              open={shareOpen}
              onOpenChange={setShareOpen}
              shareUrl={`${window.location.origin}/people/${user?.slug || user?.id}`}
              title="Share Options"
              message="Please share by using an option below."
            />
          </div>
        </div>
        <Footer />
      </div>

      {/* Section Edit Dialogs */}
      <EditHeaderDialog
        open={activeDialog === "header"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <EditAboutDialog
        open={activeDialog === "about"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <EditContactDialog
        open={activeDialog === "contact"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <EditSocialProfilesDialog
        open={activeDialog === "social"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <EditSkillsDialog
        open={activeDialog === "skills"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <EditProfessionalInfoDialog
        open={activeDialog === "professional"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
      <EditCustomUrlDialog
        open={activeDialog === "url"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
    </div>
  );
}

export default function Profile() {
  return (
    <PasswordRequirementsProvider>
      <ProfileContent />
    </PasswordRequirementsProvider>
  );
}
