import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import AuthOverlay from "@/components/AuthOverlay";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import ShareModal from "@/components/ShareModal";
import Sidebar from "@/components/Sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { JobMatchesCard, SeekerAnalyticsCard, UpcomingInterviewsCard } from "@/components/dashboard/shared";

// Profile domain — shared section components and edit dialogs. Composed
// together here, so both /people/:id and /profile (redirect) render through
// this one page.
import ProfileInsights from "@/components/profile/ProfileInsights";
import AboutSection from "@/components/profile/sections/AboutSection";
import AdditionalInfoSection from "@/components/profile/sections/AdditionalInfoSection";
import ContactSidebar from "@/components/profile/sections/ContactSidebar";
import OpportunityPreferencesSection from "@/components/profile/sections/OpportunityPreferencesSection";
import ProfileHeader from "@/components/profile/sections/ProfileHeader";
import ServicesSection from "@/components/profile/sections/ServicesSection";
import SkillsSection from "@/components/profile/sections/SkillsSection";
import SocialProfilesSection from "@/components/profile/sections/SocialProfilesSection";
import VideoResumeSection from "@/components/profile/sections/VideoResumeSection";
import VisitorActionsSection, {
  type ConnectionState,
} from "@/components/profile/sections/VisitorActionsSection";
import ConnectionRequestDialog from "@/components/profile/dialogs/ConnectionRequestDialog";
import EditAboutDialog from "@/components/profile/dialogs/EditAboutDialog";
import EditContactDialog from "@/components/profile/dialogs/EditContactDialog";
import EditCustomUrlDialog from "@/components/profile/dialogs/EditCustomUrlDialog";
import EditHeaderDialog from "@/components/profile/dialogs/EditHeaderDialog";
import EditSkillsDialog from "@/components/profile/dialogs/EditSkillsDialog";
import EditSocialProfilesDialog from "@/components/profile/dialogs/EditSocialProfilesDialog";
import ServiceInquiryDialog from "@/components/profile/dialogs/ServiceInquiryDialog";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { createRolePermissions, formatRoleForDisplay, getRoleDisplayLabel } from "@/lib/role-utils";
import { dashboardService } from "@/lib/services/dashboard-service";
import {
  recruiterService,
  type AddToTalentPoolRequest,
} from "@/lib/services/recruiter-service";
import { servicesService, type ServiceOffering } from "@/lib/services/services-service";
import { userService } from "@/lib/services/user-service";
import { generateStructuredData, useSEO } from "@/lib/seo";
import { useProfileView, type ProfileViewTarget } from "@/hooks/useProfileView";
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";

type OwnerDialog =
  | "header"
  | "about"
  | "contact"
  | "social"
  | "skills"
  | "url"
  | null;

function PeopleDetailContent() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser, isAuthenticated } = useAuth();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { addItem, openCart } = useCart();

  // Route param resolution — /profile is mapped to /people/me at the router
  // level; visitors use /people/:uuid or /people/:slug.
  const target: ProfileViewTarget = (id ?? "me") as ProfileViewTarget;

  const {
    profile,
    masterResume,
    videos,
    services,
    isOwner,
    connection,
    inTalentPool,
    dashboard,
    seekerAnalytics,
    loading,
    error,
    refetch,
  } = useProfileView(target);

  // ---------------------------------------------------------------------
  // Local UI state — dialogs and in-flight flags. All mutations delegate to
  // the domain services and then call refetch() to re-sync the aggregate.
  // ---------------------------------------------------------------------
  const [activeOwnerDialog, setActiveOwnerDialog] = useState<OwnerDialog>(null);
  const [showShare, setShowShare] = useState(false);

  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);

  const [isTracked, setIsTracked] = useState(false);
  const [talentPoolBusy, setTalentPoolBusy] = useState(false);

  const [inquiryService, setInquiryService] = useState<ServiceOffering | null>(null);
  const [inquiryBusy, setInquiryBusy] = useState(false);

  // ---------------------------------------------------------------------
  // Derived: role / perms / displayed fields
  // ---------------------------------------------------------------------
  const viewerPerms = useMemo(
    () => createRolePermissions((authUser as any)?.role ?? null),
    [authUser],
  );

  const firstName = profile?.data?.firstName ?? (profile as any)?.firstName ?? "";
  const lastName = profile?.data?.lastName ?? (profile as any)?.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  const visibility = {
    showEmail: (profile as any)?.data?.showEmail ?? (profile as any)?.showEmail ?? false,
    showPhone: (profile as any)?.data?.showPhone ?? (profile as any)?.showPhone ?? false,
    showLocation:
      (profile as any)?.data?.showLocation ?? (profile as any)?.showLocation ?? false,
  };

  // Location is privacy-gated for visitors.
  const displayedLocation =
    isOwner || visibility.showLocation ? profile?.location ?? undefined : undefined;

  const joinedText = useMemo(() => {
    const iso = profile?.createdAt;
    if (!iso) return "Joined";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Joined";
    return `Joined ${d.toLocaleString(undefined, { month: "long", year: "numeric" })}`;
  }, [profile?.createdAt]);

  const memberSince = useMemo(() => {
    const iso = profile?.createdAt;
    if (!iso) return undefined;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? undefined : d.toLocaleDateString();
  }, [profile?.createdAt]);

  const lastActive = useMemo(() => {
    const iso = profile?.lastLoginAt ?? profile?.updatedAt;
    if (!iso) return undefined;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? undefined : d.toLocaleDateString();
  }, [profile?.lastLoginAt, profile?.updatedAt]);

  // Map the ConnectionRelationship into the presentational ConnectionState
  // consumed by VisitorActionsSection. Two shapes, one is for the UI, the
  // other carries the relationship id for mutations.
  const connectionState: ConnectionState = connection.status;

  // Resume descriptor — honour saved template, suppress hero since
  // ProfileHeader already shows name/avatar/contact.
  const resumeDescriptor = useMemo<ResumeTemplateDescriptor>(() => {
    const saved = getTemplateById(masterResume?.content?.meta?.template);
    const base = saved ?? DEFAULT_DESCRIPTOR;
    return { ...base, hero: { ...base.hero, enabled: false } };
  }, [masterResume?.content?.meta?.template]);

  // ---------------------------------------------------------------------
  // SEO + profile-view tracking
  // ---------------------------------------------------------------------
  const seoTitle = profile
    ? `${fullName || "User"}, ${getRoleDisplayLabel((profile as any).role ?? "")} — hired.video`
    : undefined;
  const seoDescription = profile
    ? profile.bio ||
      `${fullName || "User"} is a ${getRoleDisplayLabel((profile as any).role ?? "")}.`
    : undefined;
  const structuredData = profile
    ? generateStructuredData.person({
        name: fullName,
        title: getRoleDisplayLabel((profile as any).role ?? ""),
        bio: profile.bio ?? undefined,
        avatar: profile.profilePicture ?? undefined,
        id: profile.id ?? "",
      })
    : undefined;
  useSEO(location.pathname, {
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    structuredData,
  });

  // Track profile view — only authenticated visitors viewing someone else's
  // profile. Self-views would pollute the analytics.
  useEffect(() => {
    if (!profile?.id || !isAuthenticated || isOwner) return;
    dashboardService
      .recordProfileView({ profileUserId: profile.id, viewType: "profile" })
      .catch((err) => console.warn("Profile view tracking failed:", err));
  }, [profile?.id, isAuthenticated, isOwner]);

  // ---------------------------------------------------------------------
  // Visitor handlers — connection state machine
  // ---------------------------------------------------------------------
  const handleSendConnectionRequest = async (message: string) => {
    if (!isAuthenticated || !profile?.id || connectionBusy) return;
    setConnectionBusy(true);
    try {
      await userService.sendConnectionRequest({ toUserId: profile.id, message });
      setShowConnectionDialog(false);
      toast.success(t("messages.connectionSent"));
      refetch();
    } catch (err) {
      console.error("Failed to send connection request:", err);
      toast.error(t("errors.connectionRequestFailed"));
    } finally {
      setConnectionBusy(false);
    }
  };

  const handleAcceptConnection = async () => {
    if (!connection.id || connectionBusy) return;
    setConnectionBusy(true);
    try {
      await userService.acceptConnectionRequest(connection.id);
      toast.success(t("messages.connectionAccepted"));
      refetch();
    } catch (err) {
      console.error("Failed to accept connection:", err);
      toast.error(t("errors.acceptConnectionFailed"));
    } finally {
      setConnectionBusy(false);
    }
  };

  const handleRejectConnection = async () => {
    if (!connection.id || connectionBusy) return;
    setConnectionBusy(true);
    try {
      await userService.rejectConnectionRequest(connection.id);
      toast.success(t("messages.connectionDeclined"));
      refetch();
    } catch (err) {
      console.error("Failed to reject connection:", err);
      toast.error(t("errors.declineConnectionFailed"));
    } finally {
      setConnectionBusy(false);
    }
  };

  const handleCancelConnectionRequest = async () => {
    if (!connection.id || connectionBusy) return;
    setConnectionBusy(true);
    try {
      await userService.rejectConnectionRequest(connection.id);
      toast.success(t("messages.connectionRevoked"));
      refetch();
    } catch (err) {
      console.error("Failed to revoke connection request:", err);
      toast.error(t("errors.revokeConnectionFailed"));
    } finally {
      setConnectionBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection.id || connectionBusy) return;
    if (!window.confirm(t("messages.confirmRemoveConnection", { name: firstName || t("messages.thisUserFallback") }))) return;
    setConnectionBusy(true);
    try {
      await userService.rejectConnectionRequest(connection.id);
      toast.success(t("messages.connectionRemoved"));
      refetch();
    } catch (err) {
      console.error("Failed to remove connection:", err);
      toast.error(t("errors.removeConnectionFailed"));
    } finally {
      setConnectionBusy(false);
    }
  };

  const handleMessage = () => {
    // TODO: messaging flow — placeholder handler preserved from the original
    // PeopleDetail.
    console.log("Message person:", profile?.id);
  };

  const handleTrackPerson = () => {
    // TODO: follow/track API — placeholder preserved from original.
    if (!isAuthenticated || !profile?.id) return;
    setIsTracked((prev) => !prev);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: fullName || t("headings.profile"), url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("messages.profileLinkCopied"));
      }
    } catch {
      /* share dismissed or not supported — no-op */
    }
  };

  const handleAddToTalentPool = async () => {
    if (!profile?.id || !viewerPerms.isRecruiter || talentPoolBusy) return;
    setTalentPoolBusy(true);
    try {
      const request: AddToTalentPoolRequest = {
        candidateUserId: profile.id,
        relationshipStrength: "New",
        status: "Active",
        poolName: "General",
      };
      await recruiterService.addToTalentPool(request);
      toast.success(t("messages.candidateAddedTalentPool", { name: fullName || t("labels.candidate") }));
      refetch();
    } catch (err) {
      console.error("Failed to add to talent pool:", err);
      toast.error(t("errors.addToTalentPoolFailed"));
    } finally {
      setTalentPoolBusy(false);
    }
  };

  const handleSubmitToJob = () => toast.info(t("messages.submitToJobComingSoon"));

  const handleSectionEdit = (key: string) => {
    if (!masterResume) return;
    navigate(`/resumes/edit/${masterResume.id}?section=${encodeURIComponent(key)}`);
  };

  // ---------------------------------------------------------------------
  // Services marketplace handlers
  // ---------------------------------------------------------------------
  const handleAddServiceToCart = (svc: ServiceOffering) => {
    if (svc.priceCents == null) return;
    addItem({
      id: `service-${svc.id}`,
      name: svc.title,
      price: svc.priceCents / 100,
      type: "service",
      serviceId: svc.id,
      providerId: svc.userId,
      providerName: fullName || undefined,
    });
    openCart();
  };

  const handleRequestQuote = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId) ?? null;
    setInquiryService(svc);
  };

  const handleSubmitInquiry = async (message: string) => {
    if (!inquiryService) return;
    setInquiryBusy(true);
    try {
      await servicesService.submitInquiry(inquiryService.id, {
        message,
        orderType: "inquiry",
      });
      toast.success(t("messages.inquirySent"));
      setInquiryService(null);
    } catch {
      toast.error(t("errors.sendInquiryFailed"));
    } finally {
      setInquiryBusy(false);
    }
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
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
              title={fullName || t("messages.userProfileFallback")}
            />
          )}
          {children}
        </div>
        <Footer />
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="max-w-4xl mx-auto p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t("status.loadingProfile")}</h1>
      </div>,
    );
  }

  if (error || !profile) {
    return shell(
      <div className="max-w-4xl mx-auto p-6 text-center">
        <Alert className="mb-6">
          <AlertDescription>{error ?? t("messages.profileNotFound")}</AlertDescription>
        </Alert>
        <h1 className="text-2xl font-bold mb-4">{t("messages.profileNotFoundTitle")}</h1>
        <Button asChild>
          <Link to="/people">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("actions.backToPeople")}
          </Link>
        </Button>
      </div>,
    );
  }

  const dd = dashboard as any;
  const peopleAreaSlug = profile.slug ?? profile.id ?? "";

  return (
    <>
      {shell(
        <div className="max-w-6xl mx-auto p-6">
          {!isOwner && (
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate("/people")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("actions.backToPeople")}
              </Button>
            </div>
          )}

          <div className="mb-6">
            <ProfileHeader
              avatar={profile.profilePicture ?? undefined}
              firstName={firstName}
              lastName={lastName}
              headline={(profile as any).data?.headline ?? undefined}
              roleBadge={formatRoleForDisplay((profile as any).role ?? null)}
              subscription={profile.subscription ?? undefined}
              email={profile.email ?? ""}
              phone={isOwner || visibility.showPhone ? profile.phone ?? undefined : undefined}
              location={displayedLocation}
              currentRole={profile.currentRole ?? undefined}
              currentCompany={profile.currentCompany ?? undefined}
              website={profile.website ?? undefined}
              joinedText={joinedText}
              slug={profile.slug ?? undefined}
              isOwner={isOwner}
              onEditProfile={() => setActiveOwnerDialog("header")}
              onEditUrl={() => setActiveOwnerDialog("url")}
              onShare={() => setShowShare(true)}
            />
          </div>

          {!isOwner && (
            <div className="mb-6">
              <VisitorActionsSection
                isAuthenticated={isAuthenticated}
                connectionState={connectionState}
                busy={connectionBusy}
                isRecruiter={viewerPerms.isRecruiter}
                isEmployer={viewerPerms.isEmployer}
                inTalentPool={inTalentPool === true}
                talentPoolBusy={talentPoolBusy}
                isTracked={isTracked}
                personId={profile.id ?? ""}
                personName={
                  [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
                  undefined
                }
                onConnect={() => setShowConnectionDialog(true)}
                onAcceptConnection={handleAcceptConnection}
                onRejectConnection={handleRejectConnection}
                onCancelConnectionRequest={handleCancelConnectionRequest}
                onDisconnect={handleDisconnect}
                onMessage={handleMessage}
                onTrack={handleTrackPerson}
                onShare={handleShare}
                onAddToTalentPool={handleAddToTalentPool}
                onSubmitToJob={handleSubmitToJob}
              />
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="profile" className="space-y-6">
                <TabsList>
                  <TabsTrigger value="profile">{t("headings.profile")}</TabsTrigger>
                  <TabsTrigger value="services">
                    {t("tabs.services")}
                    {(profile as any).isCreator && (
                      <Badge variant="outline" className="ml-2 text-[10px] bg-purple-50 text-purple-700 border-purple-200">{t("labels.creator")}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-6 mt-0">
                  <AboutSection
                    bio={profile.bio ?? undefined}
                    isOwner={isOwner}
                    onEdit={() => setActiveOwnerDialog("about")}
                  />

                  <VideoResumeSection videos={videos} isOwner={isOwner} />

                  {masterResume ? (
                    <div className="-mx-6 [&_.max-w-6xl]:max-w-none">
                      <DeclarativeResumeRenderer
                        resume={masterResume}
                        descriptor={resumeDescriptor}
                        embedded
                        isOwner={isOwner}
                        onEditSection={handleSectionEdit}
                      />
                    </div>
                  ) : (
                    <NoResumeCard isOwner={isOwner} />
                  )}

                  <SkillsSection
                    profileSkills={profile.skills ?? undefined}
                    industries={(profile as any).data?.industries ?? undefined}
                    isOwner={isOwner}
                    onEdit={() => setActiveOwnerDialog("skills")}
                    title={t("messages.industriesAndSearchTags")}
                  />
                </TabsContent>

                <TabsContent value="services" className="space-y-6 mt-0">
                  {(profile as any).isCreator && (profile as any).creatorProfile && (
                    <Alert>
                      <AlertDescription>
                        <strong>{(profile as any).creatorProfile.displayName ?? firstName}</strong>
                        {(profile as any).creatorProfile.tagline ? ` — ${(profile as any).creatorProfile.tagline}` : ""}
                        {(profile as any).creatorProfile.bio ? <p className="mt-2 text-sm">{(profile as any).creatorProfile.bio}</p> : null}
                      </AlertDescription>
                    </Alert>
                  )}
                  <ServicesSection
                    services={services}
                    isOwner={isOwner}
                    providerFirstName={firstName || undefined}
                    onAddToCart={handleAddServiceToCart}
                    onRequestQuote={handleRequestQuote}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Sidebar — split by owner vs visitor audience. */}
            <div className="space-y-6">
              <ContactSidebar
                email={profile.email ?? undefined}
                phone={profile.phone ?? undefined}
                website={profile.website ?? undefined}
                isOwner={isOwner}
                onEdit={() => setActiveOwnerDialog("contact")}
                visibility={{
                  showEmail: visibility.showEmail,
                  showPhone: visibility.showPhone,
                }}
              />

              <SocialProfilesSection
                linkedIn={profile.linkedIn ?? undefined}
                github={profile.github ?? undefined}
                twitter={(profile as any).data?.twitter ?? undefined}
                isOwner={isOwner}
                onEdit={() => setActiveOwnerDialog("social")}
              />

              {isOwner ? (
                <>
                  <ProfileInsights profileStats={dd?.profileStats} />
                  {viewerPerms.isJobSeeker && (
                    <>
                      <SeekerAnalyticsCard analytics={seekerAnalytics} />
                      <JobMatchesCard matches={dd?.jobMatches} />
                      <UpcomingInterviewsCard interviews={dd?.upcomingInterviews} />
                    </>
                  )}
                </>
              ) : (
                <OpportunityPreferencesSection
                  openToWork={!!profile.openToWork}
                  opportunityTypes={(profile as any).data?.preferredRoles ?? []}
                  preferredRoles={(profile as any).data?.preferredRoles ?? []}
                  salaryExpectation={
                    (profile as any).data?.salaryExpectation != null
                      ? {
                          min: (profile as any).data.salaryExpectation,
                          currency: (profile as any).data.salaryCurrency ?? undefined,
                        }
                      : null
                  }
                />
              )}

              <AdditionalInfoSection
                languages={(profile as any).data?.languages ?? []}
                interests={(profile as any).data?.interests ?? []}
                memberSince={memberSince}
                lastActive={lastActive}
                showOwnerMeta={isOwner}
              />
            </div>
          </div>
        </div>,
      )}

      {/* Owner-only: edit dialogs and share modal */}
      {isOwner && (
        <>
          <EditHeaderDialog
            open={activeOwnerDialog === "header"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
          />
          <EditAboutDialog
            open={activeOwnerDialog === "about"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
          />
          <EditContactDialog
            open={activeOwnerDialog === "contact"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
          />
          <EditSocialProfilesDialog
            open={activeOwnerDialog === "social"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
          />
          <EditSkillsDialog
            open={activeOwnerDialog === "skills"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
          />
          <EditCustomUrlDialog
            open={activeOwnerDialog === "url"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
          />
          <ShareModal
            open={showShare}
            onOpenChange={setShowShare}
            shareUrl={`${window.location.origin}/people/${peopleAreaSlug}`}
            title={t("messages.shareProfile")}
            message={t("messages.shareProfileMessage")}
          />
        </>
      )}

      {/* Visitor-only: connection request + service inquiry */}
      {!isOwner && (
        <>
          <ConnectionRequestDialog
            open={showConnectionDialog}
            onOpenChange={setShowConnectionDialog}
            targetFirstName={firstName || t("messages.thisUserFallback")}
            busy={connectionBusy}
            onSubmit={handleSendConnectionRequest}
          />
          <ServiceInquiryDialog
            open={!!inquiryService}
            onOpenChange={(open) => !open && setInquiryService(null)}
            service={inquiryService}
            providerFirstName={firstName || undefined}
            busy={inquiryBusy}
            onSubmit={handleSubmitInquiry}
          />
        </>
      )}
    </>
  );
}

function NoResumeCard({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-card text-card-foreground p-10 text-center">
      <h3 className="font-semibold text-lg mb-2">
        {isOwner ? t("messages.noMasterResumeFound") : t("messages.professionalDetailsPrivate")}
      </h3>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
        {isOwner
          ? t("messages.noMasterResumeOwnerCta")
          : t("messages.noMasterResumeVisitor")}
      </p>
      {isOwner && (
        <Button asChild>
          <Link to="/resumes">{t("actions.manageResumes")}</Link>
        </Button>
      )}
    </div>
  );
}

export default function PeopleDetail() {
  // Owner-path editing dialogs call updateProfile() which expects password
  // requirements to be loaded — mirrors Profile.tsx's original wrapper.
  return (
    <PasswordRequirementsProvider>
      <PeopleDetailContent />
    </PasswordRequirementsProvider>
  );
}
