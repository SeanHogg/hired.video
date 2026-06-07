import { ArrowLeft, Building2, Loader2, User as UserIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import AuthOverlay from "@/components/AuthOverlay";
import ShareModal from "@/components/ShareModal";
import { useArtifactViewTracking } from "@/hooks/use-artifact-view-tracking";
import ArtifactDetailsSheet from "@/components/shared/ArtifactDetailsSheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";

import SkillNetwork from "@/components/SkillNetwork";
import MutualConnectionsRow from "@/components/graph/MutualConnectionsRow";
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
import ProfileHeaderVideos from "@/components/profile/sections/ProfileHeaderVideos";
import ProfileProgramPanel, {
  PROGRAM_ICON,
} from "@/components/profile/sections/programs/ProfileProgramPanel";
import SkillsSection from "@/components/profile/sections/SkillsSection";
import SocialProfilesSection from "@/components/profile/sections/SocialProfilesSection";
import VideoResumeSection from "@/components/profile/sections/VideoResumeSection";
import MasterResumeSection from "@/components/profile/sections/MasterResumeSection";
import { ProfileSectionsProvider } from "@/components/profile/sections/profile-sections-context";
import VisitorActionsSection, {
  type ConnectionState,
} from "@/components/profile/sections/VisitorActionsSection";
import { GrabCoffeeButton } from "@/components/events/GrabCoffeeButton";
import { WarmIntroRequestButton } from "@/components/graph/WarmIntroRequestButton";
import EmployerCompaniesTab from "@/components/company/EmployerCompaniesTab";
import ConnectionRequestDialog from "@/components/profile/dialogs/ConnectionRequestDialog";
import EditAboutDialog from "@/components/profile/dialogs/EditAboutDialog";
import EditContactDialog from "@/components/profile/dialogs/EditContactDialog";
import EditCustomUrlDialog from "@/components/profile/dialogs/EditCustomUrlDialog";
import EditHeaderDialog from "@/components/profile/dialogs/EditHeaderDialog";
import EditSkillsDialog from "@/components/profile/dialogs/EditSkillsDialog";
import EditSocialProfilesDialog from "@/components/profile/dialogs/EditSocialProfilesDialog";
import ServiceInquiryDialog from "@/components/profile/dialogs/ServiceInquiryDialog";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import EntityHubTabStrip from "@/components/EntityHubTabStrip";

import { useStartConversation } from "@/hooks/use-start-conversation";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { createRolePermissions, formatRoleForDisplay, getRoleDisplayLabel, roleUtils } from "@/lib/role-utils";
import { dashboardService } from "@/lib/services/dashboard-service";
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import {
  recruiterService,
  type AddToTalentPoolRequest,
} from "@/lib/services/recruiter-service";
import { servicesService, type ServiceOffering } from "@/lib/services/services-service";
import {
  CREATOR_PROGRAMS,
  CREATOR_PROGRAM_LABEL,
  type CreatorProgram,
} from "@/lib/services/creator-service";
import { userService } from "@/lib/services/user-service";
import { confirmDialog } from "@/lib/dialogs";
import { useUgcSeo } from "@/lib/seo-ugc";
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
  const [searchParams] = useSearchParams();
  const { user: authUser, isAuthenticated } = useAuth();  const { addItem, openCart } = useCart();

  // Route param resolution — /profile is mapped to /people/me at the router
  // level; visitors use /people/:uuid or /people/:slug.
  const target: ProfileViewTarget = (id ?? "me") as ProfileViewTarget;

  const {
    profile,
    masterResume,
    videos,
    isOwner,
    connection,
    inTalentPool,
    dashboard,
    seekerAnalytics,
    loading,
    error,
    refetch,
  } = useProfileView(target);

  useArtifactViewTracking({
    artifactKind: "profile",
    artifactId: profile?.id ?? null,
    ownerUserId: profile?.id ?? null,
  });

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

  const { start: startConversation } = useStartConversation();

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
  // SEO — single adapter call. Builder lives in lib/seo-ugc.ts ("person"
  // kind) and decides title/description/ogImage/keywords/JSON-LD.
  // ---------------------------------------------------------------------
  const resumeSkillTokens = useMemo<string[]>(() => {
    return (masterResume?.content?.skills ?? []).flatMap((s: any) => [
      ...(s?.name ? [s.name as string] : []),
      ...((s?.keywords ?? []) as string[]),
    ]);
  }, [masterResume]);

  const personSeoRecord = useMemo(() => {
    if (!profile) return null;
    return {
      id: profile.id ?? "",
      fullName: fullName || undefined,
      bio: profile.bio ?? undefined,
      profilePicture: profile.profilePicture ?? undefined,
      role: (profile as any).role,
      roleLabel: getRoleDisplayLabel((profile as any).role ?? ""),
      skills: profile.skills ?? undefined,
      industries: (profile as any).industries ?? undefined,
      resumeSkills: resumeSkillTokens,
    };
  }, [profile, fullName, resumeSkillTokens]);

  useUgcSeo("person", personSeoRecord);

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
    if (!(await confirmDialog({ title: "Remove connection", description: t("messages.confirmRemoveConnection", { name: firstName || t("messages.thisUserFallback") }), confirmText: "Remove", destructive: true }))) return;
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
    if (!profile?.id) return;
    void startConversation(profile.id);
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

  const handleSectionEdit = async () => {
    if (!masterResume) return;
    navigate(await resumeEditorPath(masterResume.id));
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

  const handleRequestQuote = (svc: ServiceOffering) => {
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
  // Owners with `promoteWithoutAuth` opted in let unauth visitors view the
  // full page (creator / service-provider promotion link). Everyone else
  // still gets the AuthOverlay sign-in mask.
  const showAuthOverlay = !isAuthenticated && !(profile as any)?.promoteWithoutAuth;
  const shell = (children: React.ReactNode) => (
    <AppShell bgClassName="bg-background">
      <div className={showAuthOverlay ? "relative" : undefined}>
        {showAuthOverlay && (
          <AuthOverlay
            contentType="person"
            title={fullName || t("messages.userProfileFallback")}
          />
        )}
        {children}
      </div>
    </AppShell>
  );

  if (loading) {
    return shell(
      <div className="p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t("status.loadingProfile")}</h1>
      </div>,
    );
  }

  if (error || !profile) {
    return shell(
      <div className="p-6 text-center">
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

  // Surface tabs (Profile / Company / one per active creator program) live
  // in the page-level breadcrumb strip above the profile card so the user
  // can pivot between surfaces without scrolling. Tab state lives in the
  // URL (?tab=…) so refresh and back-button work like the rest of the site.
  //
  // The program tabs are derived from `profile.creatorPrograms`. Owners
  // always see every program tab — even ones they haven't formally
  // enrolled in via /api/creators/opt-in — so the profile doubles as the
  // navigation hub for managing each surface, and each panel renders its
  // own "publish your first item" CTA. Visitors see only the programs
  // the owner has actually enrolled in (per `creatorProfiles.*_active`)
  // so empty tabs don't clutter someone else's profile.
  const isEmployerProfile = roleUtils.isEmployer((profile as any).role);
  const tabParam = searchParams.get("tab");
  const profileBaseUrl = `/people/${peopleAreaSlug}`;

  const activePrograms: CreatorProgram[] = isOwner
    ? [...CREATOR_PROGRAMS]
    : CREATOR_PROGRAMS.filter(
        (p) => ((profile as any).creatorPrograms?.[p] as boolean | undefined) === true,
      );

  const validTabKeys = new Set<string>([
    "profile",
    ...(isEmployerProfile ? ["company"] : []),
    ...activePrograms,
  ]);
  const defaultTab = isEmployerProfile ? "company" : "profile";
  const activeProfileTab: string =
    tabParam && validTabKeys.has(tabParam) ? tabParam : defaultTab;

  const profileTabs: PageHeaderTab[] = [
    ...(isEmployerProfile
      ? [
          {
            key: "company",
            label: t("tabs.company", { defaultValue: "Company" }),
            icon: Building2,
            to: `${profileBaseUrl}?tab=company`,
          } satisfies PageHeaderTab,
        ]
      : []),
    {
      key: "profile",
      label: t("headings.profile"),
      icon: UserIcon,
      to: `${profileBaseUrl}?tab=profile`,
    },
    ...activePrograms.map<PageHeaderTab>((p) => ({
      key: p,
      label: CREATOR_PROGRAM_LABEL[p],
      icon: PROGRAM_ICON[p],
      to: `${profileBaseUrl}?tab=${p}`,
    })),
  ];

  return (
    <ProfileSectionsProvider
      stored={(profile as any)?.profileSectionsRaw ?? (profile as any)?.profileSections ?? null}
      role={(profile as any)?.role ?? null}
    >
      {shell(
        <div className="p-4 md:p-6">
          {/* Hub-level tab strip — keeps the People / Connections /
              Talent Pool / etc. context visible across profile pages. */}
          <EntityHubTabStrip entity="person" />
          <PageHeader tabs={profileTabs} activeTabKey={activeProfileTab} />

          <div className="mb-6">
            <ProfileHeader
              avatar={profile.profilePicture ?? undefined}
              firstName={firstName}
              lastName={lastName}
              headline={(profile as any).data?.headline ?? undefined}
              roleBadge={formatRoleForDisplay((profile as any).role ?? null)}
              subscription={profile.subscription ?? undefined}
              currentRole={profile.currentRole ?? undefined}
              currentCompany={profile.currentCompany ?? undefined}
              joinedText={joinedText}
              slug={profile.slug ?? undefined}
              isOwner={isOwner}
              onEditProfile={() => setActiveOwnerDialog("header")}
              onEditUrl={() => setActiveOwnerDialog("url")}
              onShare={() => setShowShare(true)}
              rightSlot={<ProfileHeaderVideos videos={videos} />}
              detailsSlot={
                <ArtifactDetailsSheet
                  permission={{ kind: "profile", entity: profile ? { id: profile.id } : null }}
                  title={fullName || "Profile"}
                  activity={{
                    createdAt: profile?.createdAt ?? undefined,
                    updatedAt: profile?.updatedAt ?? undefined,
                    extra: lastActive
                      ? [{ label: "Last active", value: lastActive }]
                      : undefined,
                  }}
                />
              }
            />
          </div>

          {!isOwner && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <VisitorActionsSection
                isAuthenticated={isAuthenticated}
                connectionState={connectionState}
                busy={connectionBusy}
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
              <GrabCoffeeButton
                targetUserId={profile.id ?? ""}
                targetName={[profile.firstName, profile.lastName].filter(Boolean).join(" ") || null}
                isSelf={isOwner}
              />
              <WarmIntroRequestButton
                targetUserId={profile.id ?? ""}
                targetName={[profile.firstName, profile.lastName].filter(Boolean).join(" ") || null}
                isSelf={isOwner}
              />
            </div>
          )}

          {/* #1262 — Mutuals row + warm-intro path CTA. Self-gates to null
              for the profile owner and for empty mutuals lists. */}
          {profile.id && !isOwner && (
            <div className="mt-3">
              <MutualConnectionsRow targetUserId={profile.id} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2">
              <Tabs value={activeProfileTab} className="space-y-6">
                <TabsContent value="company" className="space-y-6 mt-0">
                  <EmployerCompaniesTab
                    profileUserId={profile.id ?? ""}
                    profileRole={(profile as any).role}
                    isOwner={isOwner}
                  />
                </TabsContent>

                <TabsContent value="profile" className="space-y-6 mt-0">
                  <AboutSection
                    bio={profile.bio ?? undefined}
                    isOwner={isOwner}
                    onEdit={() => setActiveOwnerDialog("about")}
                  />

                  <VideoResumeSection videos={videos} isOwner={isOwner} />

                  <MasterResumeSection
                    masterResume={masterResume}
                    descriptor={resumeDescriptor}
                    isOwner={isOwner}
                    onEditSection={handleSectionEdit}
                  />

                  <SkillNetwork
                    resumeData={masterResume?.content}
                    resumeId={masterResume?.id ?? null}
                    ownerUserId={masterResume?.userId ?? null}
                    onResumeUpdated={refetch}
                    title={
                      isOwner
                        ? t("headings.skillNetwork", { defaultValue: "Skill Network" })
                        : `${firstName || t("messages.thisUserFallback")}'s Skill Network`
                    }
                  />

                  <SkillsSection
                    keywords={profile.skills ?? undefined}
                    industries={(profile as any).industries ?? undefined}
                    isOwner={isOwner}
                    onEdit={() => setActiveOwnerDialog("skills")}
                    title={t("messages.discoverabilityTags")}
                  />
                </TabsContent>

                {/* One TabsContent per active creator program — body is
                    rendered by ProfileProgramPanel, which switches on
                    program and delegates to a self-fetching child. The
                    creator-profile blurb (display name + tagline + bio)
                    sits above the first program's content so it's visible
                    regardless of which program tab the visitor lands on
                    via a deep link. */}
                {activePrograms.map((p) => (
                  <TabsContent key={p} value={p} className="space-y-6 mt-0">
                    {(profile as any).isCreator && (profile as any).creatorProfile && (
                      <Alert>
                        <AlertDescription>
                          <strong>{(profile as any).creatorProfile.displayName ?? firstName}</strong>
                          {(profile as any).creatorProfile.tagline ? ` — ${(profile as any).creatorProfile.tagline}` : ""}
                          {(profile as any).creatorProfile.bio ? <p className="mt-2 text-sm">{(profile as any).creatorProfile.bio}</p> : null}
                        </AlertDescription>
                      </Alert>
                    )}
                    {profile?.id && (
                      <ProfileProgramPanel
                        program={p}
                        userId={profile.id}
                        isOwner={isOwner}
                        providerFirstName={firstName || undefined}
                        onAddServiceToCart={handleAddServiceToCart}
                        onRequestServiceQuote={handleRequestQuote}
                      />
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* Sidebar — split by owner vs visitor audience. */}
            <div className="space-y-6">
              <ContactSidebar
                email={profile.email ?? undefined}
                phone={profile.phone ?? undefined}
                location={profile.location ?? undefined}
                website={profile.website ?? undefined}
                isOwner={isOwner}
                onEdit={() => setActiveOwnerDialog("contact")}
                visibility={{
                  showEmail: visibility.showEmail,
                  showPhone: visibility.showPhone,
                  showLocation: visibility.showLocation,
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
            onSaved={refetch}
          />
          <EditAboutDialog
            open={activeOwnerDialog === "about"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
            onSaved={refetch}
          />
          <EditContactDialog
            open={activeOwnerDialog === "contact"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
            onSaved={refetch}
          />
          <EditSocialProfilesDialog
            open={activeOwnerDialog === "social"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
            onSaved={refetch}
          />
          <EditSkillsDialog
            open={activeOwnerDialog === "skills"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
            onSaved={refetch}
          />
          <EditCustomUrlDialog
            open={activeOwnerDialog === "url"}
            onOpenChange={(open) => !open && setActiveOwnerDialog(null)}
            onSaved={refetch}
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
    </ProfileSectionsProvider>
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
