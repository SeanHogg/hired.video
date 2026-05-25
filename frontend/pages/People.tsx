import {
  Users,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  MessageCircle,
  UserPlus,
  Network,
  CheckCircle2,
  Play,
  Globe,
  Handshake,
  TrendingUp,
  Filter,
  X,
  Eye,
  UserCheck,
  Clock,
  Building2,
  Briefcase,
  Tag,
  Edit,
  Trash2,
  Phone,
  Mail,
  Calendar,
  Plus,
  FileText,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { usePagination } from "@/components/Pagination";
import PeopleCard from "@/components/PeopleCard";
import DiscoverPeopleGrid from "@/components/DiscoverPeopleGrid";
import type { SearchFilters } from "@/components/SearchBar";
import { useHeaderFilters } from "@/lib/header-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  userService,
  type UserFilters,
  type PublicUser,
} from "@/lib/services/user-service";
import {
  recruiterService,
  type TalentPoolEntry,
  type Interaction,
  type AddToTalentPoolRequest,
  type UpdateTalentPoolRequest,
  type AddInteractionRequest,
  type TalentPoolFilters,
} from "@/lib/services/recruiter-service";
import {
  submissionService,
  type SubmissionDTO,
  type SubmissionFilters,
} from "@/lib/services/submission-service";
import { apiClient } from "@/lib/api-client";
import { useConnectionStatuses } from "@/lib/use-connection-statuses";
import { listsService } from "@/lib/services/lists-service";
import ListsButton from "@/components/lists/ListsButton";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { usePeopleTabs } from "@/hooks/use-people-tabs";
import { writeEntityHubActiveTab } from "@/components/EntityHubTabStrip";
import ViewModeToggle from "@/components/ViewModeToggle";
import { useAuth, USER_ROLES } from "@/lib/auth";
import type { UserRole } from "@shared/user-roles";
import { visibleTo } from "@/lib/persona";
import { formatRoleForDisplay, createRolePermissions } from "@/lib/role-utils";
import type {
  UserWithOwnership,
  UserProfile,
  UserMetadata,
} from "@/types/people";
import { ConnectionStatus } from "@/types/people";

// Type for the people data structure
type PeopleData =
  | { tracked: UserWithOwnership[] } // Authenticated user data
  | (UserProfile & {
      // Unauthenticated user data (transformed UserProfile)
      fullName: string;
      location: string;
      experienceLevel: string;
      currentPosition?: string;
      currentCompany?: string;
    })[];

export default function People() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "browse";
  const location = useLocation();
  // SEO for people page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.people"), url: "/people" }]);
  const { isAuthenticated, user } = useAuth();
  // Shared tab strip — also rendered by /people/pitch-decks, /people/hiring,
  // /people/scorecards so one nav definition drives every People surface.
  const peopleTabs = usePeopleTabs();
  // Remember the user's current tab so the strip on /people/:id and the
  // other deep /people/* surfaces keeps it highlighted.
  useEffect(() => {
    writeEntityHubActiveTab("person", activeTab);
  }, [activeTab]);
  const urlQuery = searchParams.get("q") ?? "";
  const urlRole = searchParams.get("role") ?? "";
  const urlSkills = searchParams.get("skills") ?? "";
  const urlOpenToWork = searchParams.get("openToWork") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  useHeaderFilters([
    {
      key: "role",
      label: t("fields.industry.label"),
      type: "select",
      options: [
        { value: "job_seeker", label: t("labels.jobSeekers") },
        { value: "recruiter", label: t("labels.recruiters") },
        { value: "employer", label: t("labels.employers") },
      ],
    },
    {
      key: "skills",
      label: t("fields.skills.label"),
      type: "text",
      placeholder: t("fields.skills.placeholder"),
    },
    { key: "openToWork", label: t("fields.openToWork.label"), type: "boolean" },
  ]);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlRole) initial.role = urlRole;
    if (urlSkills) initial.skills = urlSkills;
    if (urlOpenToWork) initial.openToWork = urlOpenToWork === "true";
    if (urlLocation) initial.location = urlLocation;
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => ({
      ...prev,
      search: urlQuery,
      role: urlRole || undefined,
      skills: urlSkills || undefined,
      openToWork: urlOpenToWork ? urlOpenToWork === "true" : undefined,
      location: urlLocation || undefined,
    }));
  }, [urlQuery, urlRole, urlSkills, urlOpenToWork, urlLocation]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Lists filter: when ?list_id=X is on the URL, restrict displayed people to
  // members of that list. Null = no filter; Set = filter to these IDs.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalPeople, setTotalPeople] = useState<number>(0);

  // Talent Pool state (for recruiters)
  const [talentPool, setTalentPool] = useState<TalentPoolEntry[]>([]);
  const [talentPoolLoading, setTalentPoolLoading] = useState(false);
  const [talentPoolFilters, setTalentPoolFilters] = useState<TalentPoolFilters>({});
  const [selectedCandidate, setSelectedCandidate] = useState<TalentPoolEntry | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [interactionSheetOpen, setInteractionSheetOpen] = useState(false);

  // Submissions state (for recruiters)
  const [submissions, setSubmissions] = useState<SubmissionDTO[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionFilters, setSubmissionFilters] = useState<SubmissionFilters>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<string | null>(null);

  // Submit to Job state
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [candidateToSubmit, setCandidateToSubmit] = useState<TalentPoolEntry | null>(null);
  const [submitForm, setSubmitForm] = useState({
    jobId: "",
    resumeId: "",
    coverLetter: "",
    recruiterNotes: "",
    proposedSalary: "",
    availableStartDate: "",
  });
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    relationshipStrength: "",
    tags: [] as string[],
    poolName: "",
    status: "",
    notes: "",
    currentCompany: "",
    currentTitle: "",
    desiredSalary: undefined as number | undefined,
    preferredLocations: "",
    contactFrequency: "",
    nextFollowUpAt: "",
  });

  // Interaction form state
  const [interactionForm, setInteractionForm] = useState({
    interactionType: "Call",
    subject: "",
    notes: "",
    outcome: "",
    durationMinutes: undefined as number | undefined,
    requiresFollowUp: false,
    followUpDate: "",
  });

  // Tag input state
  const [tagInput, setTagInput] = useState("");

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(totalPeople, 9);

  // Fetch people data
  const fetchPeople = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: UserFilters = {
        search: searchFilters.search || undefined,
        role: searchFilters.role || undefined,
        location: searchFilters.location || undefined,
        skills: searchFilters.skills
          ? searchFilters.skills.split(",").map((s) => s.trim())
          : undefined,
        openToWork: searchFilters.openToWork || undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await userService.getPublicUsers(filters);
      // Include all users (including current user's own profile)
      setPeople(result.items);
      setTotalPeople(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch people:", err);
      setError("Failed to load people. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch people when filters or page changes
  useEffect(() => {
    fetchPeople();
  }, [searchFilters, currentPage, itemsPerPage]);

  // Load list membership when ?list_id changes. Membership is a Set of user
  // ids that the displayed people array gets filtered against client-side.
  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "person")
      .then((res) => {
        if (cancelled) return;
        setListMembership(new Set(res.items.map((i) => i.entityId)));
      })
      .catch(() => {
        if (cancelled) return;
        // List unavailable / deleted — fall back to no filter rather than empty.
        setListMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listIdFromUrl]);

  // Apply the list filter to the displayed people array. We don't mutate
  // `people` itself so the underlying fetch + pagination stays clean.
  const displayedPeople = useMemo(
    () =>
      listMembership ? people.filter((p) => listMembership.has(p.id)) : people,
    [people, listMembership],
  );

  // Load talent pool when tab changes (for recruiters)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const isHiringSide = visibleTo(
      [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
      user.role as UserRole,
    );

    if (isHiringSide && activeTab === "talent-pool") {
      loadTalentPool();
    }
  }, [activeTab, isAuthenticated, user, talentPoolFilters]);

  // Load submissions when tab changes (hiring-side: recruiter / employer / admin / SA)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const isHiringSide = visibleTo(
      [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
      user.role as UserRole,
    );

    if (isHiringSide && activeTab === "submissions") {
      loadSubmissions();
    }
  }, [activeTab, isAuthenticated, user, submissionFilters]);

  // Get people based on user role and authentication
  const getPeopleForUser = () => {
    if (!user) {
      return people.map((person) => ({
        ...person,
        fullName: person.fullName || "",
        location: person.location || "",
        experienceLevel: "Entry Level", // TODO: Calculate from API data when available
        currentPosition: person.currentRole || "",
        currentCompany: person.currentCompany || "",
      }));
    }

    const { tracked } = getAllPeopleForUser(user.id);
    const trackedWithOwnership: UserWithOwnership[] = tracked.map((person) => ({
      id: person.id,
      slug: person.slug,
      firstName: person.fullName?.split(" ")[0] || "",
      lastName: person.fullName?.split(" ").slice(1).join(" ") || "",
      fullName: person.fullName || "",
      avatar: person.avatar,
      headline: person.headline,
      location: person.location || "",
      role: person.role, // Keep original role value for proper processing
      visibility: "public", // Default for tracked users
      status: "active", // Default status
      companyId: "", // Not available in UserMetadataDTO
      companyName: person.currentCompany || "",
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
      lastActiveAt: new Date().toISOString(), // Default to now
      profileViews: person.profileViews || 0,
      connectionCount: 0, // Not available in UserMetadataDTO
      followerCount: 0, // Not available in UserMetadataDTO
      emailConfirmed: person.emailConfirmed || false,
      isPro: person.isPro || false,
      openToWork: person.openToWork || false,
      experienceLevel: getExperienceLevel(person),
      currentPosition: getCurrentPosition(person),
      currentCompany: person.currentCompany || "",
      ownership: "tracked" as const,
    }));

    return { tracked: trackedWithOwnership };
  };

  // Get user-specific people data (tracked people)
  const getAllPeopleForUser = (userId: string) => {
    // TODO: Replace with actual API calls when backend supports user people associations
    // For now, return empty arrays as placeholder
    return {
      tracked: [] as PublicUser[],
    };
  };

  // Placeholder functions for people tracking
  const addTrackedPerson = async (personId: string, userId: string) => {
    try {
      // TODO: Implement API call to track person when backend supports it
      console.log(`Track person ${personId} for user ${userId}`);
      // For now, we could use userService to follow the user
      // await userService.followUser(personId);
    } catch (error) {
      console.error("Failed to track person:", error);
    }
  };

  const removeTrackedPerson = async (personId: string, userId: string) => {
    try {
      // TODO: Implement API call to untrack person when backend supports it
      console.log(`Untrack person ${personId} for user ${userId}`);
      // For now, we could use userService to unfollow the user
      // await userService.unfollowUser(personId);
    } catch (error) {
      console.error("Failed to untrack person:", error);
    }
  };

  // Connection statuses for the Connections tab — DiscoverPeopleGrid owns
  // its own batched fetch for the Browse tab. Shared hook is the single
  // source of truth for the request + status-mapping logic.
  const trackedIds = useMemo(
    () => (user ? getAllPeopleForUser(user.id).tracked.map((p) => p.id) : []),
    [user, people],
  );
  const connectionStatuses = useConnectionStatuses(trackedIds);
  const getConnectionStatus = (
    _userId: string,
    personId: string,
  ): ConnectionStatus => connectionStatuses[personId] ?? "none";

  // Helper functions
  const getExperienceLevel = (person: any): string => {
    // TODO: Calculate experience level from API data when detailed experience is available
    // For now, return a default based on role or use a simple heuristic
    if (person.currentRole?.toLowerCase().includes("senior"))
      return "Senior Level";
    if (
      person.currentRole?.toLowerCase().includes("lead") ||
      person.currentRole?.toLowerCase().includes("manager")
    )
      return "Senior Level";
    if (person.currentRole?.toLowerCase().includes("junior"))
      return "Entry Level";
    return "Mid Level"; // Default fallback
  };

  const getCurrentPosition = (person: any): string | undefined => {
    // Use the currentRole and currentCompany from UserMetadataDTO
    if (person.currentRole && person.currentCompany) {
      return `${person.currentRole} at ${person.currentCompany}`;
    }
    return person.currentRole || undefined;
  };

  const getCompanyNameByUser = (person: UserProfile): string | undefined => {
    const companyMap: { [key: string]: string } = {
      "techcorp-inc": "TechCorp Inc.",
      "growth-dynamics": "Growth Dynamics",
      "cloudscale-solutions": "CloudScale Solutions",
    };
    return person.companyId ? companyMap[person.companyId] : undefined;
  };

  const handleTrackPerson = (personId: string) => {
    if (user) {
      addTrackedPerson(personId, user.id);
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleUntrackPerson = (personId: string) => {
    if (user) {
      removeTrackedPerson(personId, user.id);
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleConnect = async (personId: string, message?: string) => {
    if (user) {
      try {
        await userService.sendConnectionRequest({ toUserId: personId, message });
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to send connection request:", error);
      }
    }
  };

  const handleAcceptConnection = async (connectionId: string) => {
    if (user) {
      try {
        await userService.acceptConnectionRequest(connectionId);
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to accept connection request:", error);
      }
    }
  };

  const handleRejectConnection = async (connectionId: string) => {
    if (user) {
      try {
        await userService.rejectConnectionRequest(connectionId);
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to reject connection request:", error);
      }
    }
  };

  const handleMessage = (personId: string) => {
    // Navigate to messaging or open message modal
    console.log("Message person:", personId);
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  // Talent Pool handlers
  const loadTalentPool = async () => {
    try {
      setTalentPoolLoading(true);
      const entries = await recruiterService.getTalentPool(talentPoolFilters);
      setTalentPool(entries);
    } catch (error) {
      console.error("Failed to load talent pool:", error);
      toast.error(t("messages.failedToLoadTalentPool"));
    } finally {
      setTalentPoolLoading(false);
    }
  };

  // Submissions handlers
  const loadSubmissions = async () => {
    try {
      setSubmissionsLoading(true);
      const data = await submissionService.getSubmissions(submissionFilters);
      setSubmissions(data);
    } catch (error) {
      console.error("Failed to load submissions:", error);
      toast.error(t("messages.failedToLoadSubmissions"));
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleSubmitToJob = async (candidate: TalentPoolEntry) => {
    setCandidateToSubmit(candidate);
    setSubmitForm({
      jobId: "",
      resumeId: "",
      coverLetter: "",
      recruiterNotes: "",
      proposedSalary: "",
      availableStartDate: "",
    });

    // Load available jobs
    try {
      const response = await apiClient.get<any>("/api/job/user-jobs");
      setAvailableJobs(response.data || []);
    } catch (error) {
      console.error("Failed to load jobs:", error);
      toast.error(t("messages.failedToLoadJobs"));
    } finally {
      setSubmitDialogOpen(true);
    }
  };

  const handleSubmitCandidate = async () => {
    if (!candidateToSubmit || !submitForm.jobId) {
      toast.error(t("messages.pleaseSelectJob"));
      return;
    }

    try {
      setSubmitting(true);
      await submissionService.submitCandidate({
        candidateUserId: candidateToSubmit.candidateUserId,
        jobId: submitForm.jobId,
        resumeId: submitForm.resumeId || undefined,
        coverLetter: submitForm.coverLetter || undefined,
        recruiterNotes: submitForm.recruiterNotes || undefined,
        proposedSalary: submitForm.proposedSalary ? parseFloat(submitForm.proposedSalary) : undefined,
        availableStartDate: submitForm.availableStartDate || undefined,
      });

      toast.success(t("messages.candidateSubmitted"));
      setSubmitDialogOpen(false);
      loadSubmissions(); // Refresh submissions list
    } catch (error) {
      console.error("Failed to submit candidate:", error);
      toast.error(error instanceof Error ? error.message : t("messages.failedToSubmitCandidate"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToTalentPool = async (candidateUserId: string) => {
    try {
      const request: AddToTalentPoolRequest = {
        candidateUserId,
        relationshipStrength: "New",
        status: "Active",
        poolName: "General",
      };
      await recruiterService.addToTalentPool(request);
      toast.success(t("messages.candidateAddedTalentPoolGeneric"));
      if (activeTab === "talent-pool") {
        loadTalentPool();
      }
    } catch (error) {
      console.error("Failed to add to talent pool:", error);
      toast.error(t("messages.failedToAddToTalentPool"));
    }
  };

  const handleEditCandidate = (candidate: TalentPoolEntry) => {
    setSelectedCandidate(candidate);
    setEditForm({
      relationshipStrength: candidate.relationshipStrength,
      tags: candidate.tags,
      poolName: candidate.poolName || "",
      status: candidate.status,
      notes: candidate.notes || "",
      currentCompany: candidate.currentCompany || "",
      currentTitle: candidate.currentTitle || "",
      desiredSalary: candidate.desiredSalary,
      preferredLocations: candidate.preferredLocations || "",
      contactFrequency: candidate.contactFrequency || "",
      nextFollowUpAt: candidate.nextFollowUpAt || "",
    });
    setEditSheetOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCandidate) return;

    try {
      const request: UpdateTalentPoolRequest = {
        relationshipStrength: editForm.relationshipStrength,
        tags: editForm.tags,
        poolName: editForm.poolName,
        status: editForm.status,
        notes: editForm.notes,
        currentCompany: editForm.currentCompany,
        currentTitle: editForm.currentTitle,
        desiredSalary: editForm.desiredSalary,
        preferredLocations: editForm.preferredLocations,
        contactFrequency: editForm.contactFrequency,
        nextFollowUpAt: editForm.nextFollowUpAt,
      };
      await recruiterService.updateTalentPoolEntry(selectedCandidate.id, request);
      toast.success(t("messages.candidateUpdated"));
      setEditSheetOpen(false);
      setSelectedCandidate(null);
      loadTalentPool();
    } catch (error) {
      console.error("Failed to update candidate:", error);
      toast.error(t("messages.failedToUpdateCandidate"));
    }
  };

  const handleDeleteCandidate = async () => {
    if (!candidateToDelete) return;

    try {
      await recruiterService.removeFromTalentPool(candidateToDelete);
      toast.success(t("messages.candidateRemovedTalentPool"));
      setDeleteDialogOpen(false);
      setCandidateToDelete(null);
      loadTalentPool();
    } catch (error) {
      console.error("Failed to remove candidate:", error);
      toast.error(t("messages.failedToRemoveCandidate"));
    }
  };

  const handleAddInteraction = (candidate: TalentPoolEntry) => {
    setSelectedCandidate(candidate);
    setInteractionForm({
      interactionType: "Call",
      subject: "",
      notes: "",
      outcome: "",
      durationMinutes: undefined,
      requiresFollowUp: false,
      followUpDate: "",
    });
    setInteractionSheetOpen(true);
  };



  const handleSaveInteraction = async () => {
    if (!selectedCandidate) return;

    try {
      const request: AddInteractionRequest = {
        talentPoolId: selectedCandidate.id,
        interactionType: interactionForm.interactionType,
        subject: interactionForm.subject,
        notes: interactionForm.notes,
        outcome: interactionForm.outcome,
        durationMinutes: interactionForm.durationMinutes,
        requiresFollowUp: interactionForm.requiresFollowUp,
        followUpDate: interactionForm.followUpDate,
      };
      await recruiterService.addInteraction(request);
      toast.success(t("messages.interactionLogged"));
      setInteractionSheetOpen(false);
      setSelectedCandidate(null);
      loadTalentPool();
    } catch (error) {
      console.error("Failed to log interaction:", error);
      toast.error(t("messages.failedToLogInteraction"));
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !editForm.tags.includes(tagInput.trim())) {
      setEditForm({
        ...editForm,
        tags: [...editForm.tags, tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditForm({
      ...editForm,
      tags: editForm.tags.filter((t) => t !== tag),
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // If user is authenticated, show the actual people page
  if (isAuthenticated && user) {
    const peopleData: PeopleData = getPeopleForUser() as PeopleData;
    const rolePermissions = createRolePermissions(user.role);
    // Consolidated hiring-side check — fold admin / SA in via the
     // canonical canManageJobs permission (drops the inline drift
     // called out by gap #360).
    const isRecruiterOrEmployer = rolePermissions.canManageJobs;

    const handleCardActions = (personId: string) => {
      // Find the candidate in talent pool
      const candidate = talentPool.find(c => c.candidateUserId === personId);
      if (candidate) {
        // If in talent pool, open the edit sheet
        handleEditCandidate(candidate);
      } else if (rolePermissions.isRecruiter) {
        // If not in talent pool but user is a recruiter, add to talent pool
        handleAddToTalentPool(personId);
      }
    };

    return (
      <AppShell bgClassName="bg-background">
        <div className="p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              <PageHeader
                tabs={peopleTabs}
                activeTabKey={activeTab}
                search={<HeaderSearch />}
                actions={
                  <>
                    <Button asChild variant="outline" className="min-h-[44px]">
                      <Link to="/profile">
                        <UserCheck className="h-4 w-4 mr-2" />
                        My Profile
                      </Link>
                    </Button>
                    {(activeTab === "browse" || activeTab === "connections") && (
                      <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    )}
                    {(activeTab === "browse" || activeTab === "connections") && isRecruiterOrEmployer && (
                      <ListsButton entityType="person" />
                    )}
                  </>
                }
              />

              {/* Connections — shared across roles. Renders the user's tracked
                  / followed people and any connection state already resolved
                  on each card. The same data also appears under the People
                  tab; this is the dedicated breadcrumb for it. */}
              {activeTab === "connections" && (
                <div className="space-y-6">
                  {("tracked" in peopleData ? peopleData.tracked.length > 0 : false) ? (
                    <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : "flex flex-col gap-4"}>
                      {("tracked" in peopleData ? peopleData.tracked : []).map(
                        (person: UserWithOwnership) => (
                          <PeopleCard
                            key={person.id}
                            person={person}
                            connectionStatus={
                              user ? getConnectionStatus(user.id, person.id) : "none"
                            }
                            layout={viewMode === "list" ? "horizontal" : "vertical"}
                            showOwnership
                            onTrack={handleTrackPerson}
                            onUntrack={handleUntrackPerson}
                            onConnect={handleConnect}
                            onMessage={handleMessage}
                            onAcceptConnection={handleAcceptConnection}
                            onRejectConnection={handleRejectConnection}
                            onActions={() => handleCardActions(person.id)}
                          />
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Eye className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No connections yet</h3>
                      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        Follow people from the People tab to build your network. They'll show up here for quick access.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab !== "connections" && (rolePermissions.isRecruiter ? (
                <div className="space-y-6">
                  {/* Browse Tab */}
                  {activeTab === "browse" && <div className="space-y-6">
                {/* #333 — Tracked / Following section dropped from the
                    Browse body; it lives under the Connections tab now so
                    each tab owns one slice. */}

                {/* Discover People — extracted to DiscoverPeopleGrid (#409). */}
                <DiscoverPeopleGrid
                  people={displayedPeople}
                  isLoading={isLoading}
                  error={error}
                  viewMode={viewMode}
                  isFilteredByList={!!listMembership}
                  currentPage={currentPage}
                  totalPeople={totalPeople}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={handleItemsPerPageChange}
                  onConnect={handleConnect}
                  onMessage={handleMessage}
                  onAcceptConnection={handleAcceptConnection}
                  onRejectConnection={handleRejectConnection}
                  onAddToTalentPool={handleAddToTalentPool}
                  onCardActions={handleCardActions}
                  onClearFilters={() => setSearchFilters({})}
                  onRetry={fetchPeople}
                />
                  </div>}

                  {/* Talent Pool Tab */}
                  {activeTab === "talent-pool" && <div className="space-y-4">
                    {talentPoolLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Card key={i}>
                            <CardHeader>
                              <Skeleton className="h-6 w-3/4 mb-2" />
                              <Skeleton className="h-4 w-1/2" />
                            </CardHeader>
                            <CardContent>
                              <Skeleton className="h-20 w-full" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : talentPool.length === 0 ? (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                          <h2 className="text-2xl font-bold mb-2">No candidates in talent pool yet</h2>
                          <p className="text-muted-foreground mb-6">
                            Start adding candidates from the Browse tab to build your talent pool
                          </p>
                          <Button onClick={() => handleTabChange("browse")}>
                            Browse Candidates
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {talentPool.map((candidate) => (
                          <Card key={candidate.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    {candidate.candidateProfilePicture && (
                                      <img
                                        src={candidate.candidateProfilePicture}
                                        alt={candidate.candidateName}
                                        className="w-12 h-12 rounded-full object-cover"
                                      />
                                    )}
                                    <div>
                                      <Link
                                        to={`/people/${candidate.candidateUserId}`}
                                        className="text-xl font-semibold hover:text-primary transition-colors"
                                      >
                                        {candidate.candidateName}
                                      </Link>
                                      {candidate.candidateTitle && (
                                        <p className="text-sm text-muted-foreground">
                                          {candidate.candidateTitle}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    <Badge variant="outline">{candidate.relationshipStrength}</Badge>
                                    <Badge variant="secondary">{candidate.status}</Badge>
                                    {candidate.poolName && (
                                      <Badge variant="default">{candidate.poolName}</Badge>
                                    )}
                                    {candidate.tags.map((tag) => (
                                      <Badge key={tag} variant="outline">
                                        <Tag className="h-3 w-3 mr-1" />
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleSubmitToJob(candidate)}
                                    title="Submit to Job"
                                  >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Submit to Job
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleAddInteraction(candidate)}
                                    title="Log Interaction"
                                  >
                                    <Phone className="h-5 w-5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditCandidate(candidate)}
                                    title="Edit"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setCandidateToDelete(candidate.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="Remove"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                {candidate.currentCompany && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                    <span>{candidate.currentCompany}</span>
                                    {candidate.currentTitle && <span>• {candidate.currentTitle}</span>}
                                  </div>
                                )}
                                {candidate.notes && (
                                  <div className="p-3 bg-muted rounded-md">
                                    <p className="text-sm font-medium mb-1">Notes:</p>
                                    <p className="text-sm text-muted-foreground">{candidate.notes}</p>
                                  </div>
                                )}
                                <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
                                  <div className="flex items-center gap-4">
                                    {candidate.lastContactedAt && (
                                      <span>Last contact: {formatDate(candidate.lastContactedAt)}</span>
                                    )}
                                    {candidate.nextFollowUpAt && (
                                      <span className="text-orange-600 font-medium">
                                        Follow-up: {formatDate(candidate.nextFollowUpAt)}
                                      </span>
                                    )}
                                  </div>
                                  <span>Added {formatDate(candidate.createdAt)}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>}

                  {/* Submissions Tab */}
                  {activeTab === "submissions" && <div className="space-y-4">
                    {submissionsLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Card key={i}>
                            <CardHeader>
                              <Skeleton className="h-6 w-3/4 mb-2" />
                              <Skeleton className="h-4 w-1/2" />
                            </CardHeader>
                            <CardContent>
                              <Skeleton className="h-20 w-full" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : submissions.length === 0 ? (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                          <h2 className="text-2xl font-bold mb-2">No submissions yet</h2>
                          <p className="text-muted-foreground mb-6">
                            Submit candidates from your talent pool to jobs to start tracking
                          </p>
                          <Button onClick={() => handleTabChange("talent-pool")}>
                            Go to Talent Pool
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {submissions.map((submission) => (
                          <Card key={submission.id}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <CardTitle className="text-lg">
                                    {submission.candidateName} → {submission.jobTitle}
                                  </CardTitle>
                                  <CardDescription>
                                    {submission.companyName} • Submitted {formatDate(submission.submittedAt)}
                                  </CardDescription>
                                </div>
                                <Badge
                                  variant={
                                    submission.status === "Hired"
                                      ? "default"
                                      : submission.status === "Rejected" || submission.status === "Withdrawn"
                                      ? "destructive"
                                      : submission.status === "Interviewing"
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {submission.status}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2 text-sm">
                                {submission.proposedSalary && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Proposed Salary:</span>
                                    <span className="font-medium">
                                      ${submission.proposedSalary.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                {submission.availableStartDate && (
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Available:</span>
                                    <span>{formatDate(submission.availableStartDate)}</span>
                                  </div>
                                )}
                                {submission.interviewDate && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Interview:</span>
                                    <span>{formatDate(submission.interviewDate)}</span>
                                  </div>
                                )}
                                {submission.statusNotes && (
                                  <div className="mt-2 p-2 bg-muted rounded-md">
                                    <p className="text-xs text-muted-foreground">Notes:</p>
                                    <p className="text-sm">{submission.statusNotes}</p>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>}
                </div>
              ) : (
                /* Non-recruiter view — same surfaces, just no Talent Pool / Submissions */
                <div className="space-y-6">
                  {/* #333 — Tracked / Following section dropped here too;
                      lives under the Connections tab. */}

                  {/* Discover People — extracted to DiscoverPeopleGrid (#409). */}
                  <DiscoverPeopleGrid
                    people={displayedPeople}
                    isLoading={isLoading}
                    error={error}
                    viewMode={viewMode}
                    isFilteredByList={!!listMembership}
                    currentPage={currentPage}
                    totalPeople={totalPeople}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={handleItemsPerPageChange}
                    onConnect={handleConnect}
                    onMessage={handleMessage}
                    onAcceptConnection={handleAcceptConnection}
                    onRejectConnection={handleRejectConnection}
                    onAddToTalentPool={handleAddToTalentPool}
                    onCardActions={handleCardActions}
                    onClearFilters={() => setSearchFilters({})}
                    onRetry={fetchPeople}
                  />

                </div>
              ))}

              {/* Edit Candidate Sheet */}
              <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
                <SheetContent side="right" className="sm:max-w-[600px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Edit Candidate Details</SheetTitle>
                    <SheetDescription>
                      Update candidate information and relationship details
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-4 py-4">
                    {/* Relationship Strength */}
                    <div className="space-y-2">
                      <Label htmlFor="relationshipStrength">Relationship Strength</Label>
                      <Select
                        value={editForm.relationshipStrength}
                        onValueChange={(value) =>
                          setEditForm({ ...editForm, relationshipStrength: value })
                        }
                      >
                        <SelectTrigger id="relationshipStrength">
                          <SelectValue placeholder="Select strength" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Warm">Warm</SelectItem>
                          <SelectItem value="Hot">Hot</SelectItem>
                          <SelectItem value="Cold">Cold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={(value) =>
                          setEditForm({ ...editForm, status: value })
                        }
                      >
                        <SelectTrigger id="status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Passive">Passive</SelectItem>
                          <SelectItem value="Placed">Placed</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Pool Name */}
                    <div className="space-y-2">
                      <Label htmlFor="poolName">Pool Name</Label>
                      <Input
                        id="poolName"
                        value={editForm.poolName}
                        onChange={(e) =>
                          setEditForm({ ...editForm, poolName: e.target.value })
                        }
                        placeholder="e.g., Senior Developers, Sales Team"
                      />
                    </div>

                    {/* Tags */}
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <div className="flex gap-2">
                        <Input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddTag();
                            }
                          }}
                          placeholder="Add tag and press Enter"
                        />
                        <Button type="button" onClick={handleAddTag} size="icon">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editForm.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => handleRemoveTag(tag)}
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Current Company */}
                    <div className="space-y-2">
                      <Label htmlFor="currentCompany">Current Company</Label>
                      <Input
                        id="currentCompany"
                        value={editForm.currentCompany}
                        onChange={(e) =>
                          setEditForm({ ...editForm, currentCompany: e.target.value })
                        }
                        placeholder="Company name"
                      />
                    </div>

                    {/* Current Title */}
                    <div className="space-y-2">
                      <Label htmlFor="currentTitle">Current Title</Label>
                      <Input
                        id="currentTitle"
                        value={editForm.currentTitle}
                        onChange={(e) =>
                          setEditForm({ ...editForm, currentTitle: e.target.value })
                        }
                        placeholder="Job title"
                      />
                    </div>

                    {/* Desired Salary */}
                    <div className="space-y-2">
                      <Label htmlFor="desiredSalary">Desired Salary</Label>
                      <Input
                        id="desiredSalary"
                        type="number"
                        value={editForm.desiredSalary || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            desiredSalary: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="Annual salary"
                      />
                    </div>

                    {/* Preferred Locations */}
                    <div className="space-y-2">
                      <Label htmlFor="preferredLocations">Preferred Locations</Label>
                      <Input
                        id="preferredLocations"
                        value={editForm.preferredLocations}
                        onChange={(e) =>
                          setEditForm({ ...editForm, preferredLocations: e.target.value })
                        }
                        placeholder="e.g., New York, Remote"
                      />
                    </div>

                    {/* Contact Frequency */}
                    <div className="space-y-2">
                      <Label htmlFor="contactFrequency">Contact Frequency</Label>
                      <Select
                        value={editForm.contactFrequency}
                        onValueChange={(value) =>
                          setEditForm({ ...editForm, contactFrequency: value })
                        }
                      >
                        <SelectTrigger id="contactFrequency">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Weekly">Weekly</SelectItem>
                          <SelectItem value="Biweekly">Biweekly</SelectItem>
                          <SelectItem value="Monthly">Monthly</SelectItem>
                          <SelectItem value="Quarterly">Quarterly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Next Follow-up */}
                    <div className="space-y-2">
                      <Label htmlFor="nextFollowUpAt">Next Follow-up Date</Label>
                      <Input
                        id="nextFollowUpAt"
                        type="date"
                        value={editForm.nextFollowUpAt}
                        onChange={(e) =>
                          setEditForm({ ...editForm, nextFollowUpAt: e.target.value })
                        }
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={editForm.notes}
                        onChange={(e) =>
                          setEditForm({ ...editForm, notes: e.target.value })
                        }
                        placeholder="Add notes about this candidate..."
                        rows={4}
                      />
                    </div>
                  </div>

                  <SheetFooter>
                    <Button variant="outline" onClick={() => setEditSheetOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEdit}>Save Changes</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              {/* Add Interaction Sheet */}
              <Sheet open={interactionSheetOpen} onOpenChange={setInteractionSheetOpen}>
                <SheetContent side="right" className="sm:max-w-[500px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Log Interaction</SheetTitle>
                    <SheetDescription>
                      Record a call, email, meeting, or note with this candidate
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-4 py-4">
                    {/* Interaction Type */}
                    <div className="space-y-2">
                      <Label htmlFor="interactionType">Interaction Type</Label>
                      <Select
                        value={interactionForm.interactionType}
                        onValueChange={(value) =>
                          setInteractionForm({ ...interactionForm, interactionType: value })
                        }
                      >
                        <SelectTrigger id="interactionType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Call">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              Call
                            </div>
                          </SelectItem>
                          <SelectItem value="Email">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              Email
                            </div>
                          </SelectItem>
                          <SelectItem value="Meeting">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Meeting
                            </div>
                          </SelectItem>
                          <SelectItem value="LinkedIn">
                            <div className="flex items-center gap-2">
                              <Network className="h-4 w-4" />
                              LinkedIn
                            </div>
                          </SelectItem>
                          <SelectItem value="Note">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Note
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Subject */}
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        value={interactionForm.subject}
                        onChange={(e) =>
                          setInteractionForm({ ...interactionForm, subject: e.target.value })
                        }
                        placeholder="Brief subject or title"
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="interactionNotes">Notes</Label>
                      <Textarea
                        id="interactionNotes"
                        value={interactionForm.notes}
                        onChange={(e) =>
                          setInteractionForm({ ...interactionForm, notes: e.target.value })
                        }
                        placeholder="Details about the interaction..."
                        rows={4}
                      />
                    </div>

                    {/* Outcome */}
                    <div className="space-y-2">
                      <Label htmlFor="outcome">Outcome</Label>
                      <Input
                        id="outcome"
                        value={interactionForm.outcome}
                        onChange={(e) =>
                          setInteractionForm({ ...interactionForm, outcome: e.target.value })
                        }
                        placeholder="e.g., Interested, Not interested, Follow-up needed"
                      />
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <Label htmlFor="duration">Duration (minutes)</Label>
                      <Input
                        id="duration"
                        type="number"
                        value={interactionForm.durationMinutes || ""}
                        onChange={(e) =>
                          setInteractionForm({
                            ...interactionForm,
                            durationMinutes: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="Optional"
                      />
                    </div>

                    {/* Requires Follow-up */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="requiresFollowUp"
                        checked={interactionForm.requiresFollowUp}
                        onChange={(e) =>
                          setInteractionForm({
                            ...interactionForm,
                            requiresFollowUp: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                      <Label htmlFor="requiresFollowUp" className="cursor-pointer">
                        Requires follow-up
                      </Label>
                    </div>

                    {/* Follow-up Date */}
                    {interactionForm.requiresFollowUp && (
                      <div className="space-y-2">
                        <Label htmlFor="followUpDate">Follow-up Date</Label>
                        <Input
                          id="followUpDate"
                          type="date"
                          value={interactionForm.followUpDate}
                          onChange={(e) =>
                            setInteractionForm({
                              ...interactionForm,
                              followUpDate: e.target.value,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>

                  <SheetFooter>
                    <Button variant="outline" onClick={() => setInteractionSheetOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveInteraction}>Log Interaction</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              {/* Delete Confirmation Dialog */}
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove from Talent Pool?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the candidate from your talent pool. All interaction
                      history will be deleted. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteCandidate}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Submit to Job Dialog */}
              <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
                <AlertDialogContent className="max-w-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit Candidate to Job</AlertDialogTitle>
                    <AlertDialogDescription>
                      Submit {candidateToSubmit?.candidateName} to a job opening
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="job-select">Job *</Label>
                      <Select value={submitForm.jobId} onValueChange={(value) => setSubmitForm({...submitForm, jobId: value})}>
                        <SelectTrigger id="job-select">
                          <SelectValue placeholder="Select a job" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableJobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {job.title} - {job.company?.name || 'Unknown Company'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="cover-letter">Cover Letter</Label>
                      <Textarea
                        id="cover-letter"
                        value={submitForm.coverLetter}
                        onChange={(e) => setSubmitForm({...submitForm, coverLetter: e.target.value})}
                        placeholder="Optional cover letter..."
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label htmlFor="recruiter-notes">Recruiter Notes (Internal)</Label>
                      <Textarea
                        id="recruiter-notes"
                        value={submitForm.recruiterNotes}
                        onChange={(e) => setSubmitForm({...submitForm, recruiterNotes: e.target.value})}
                        placeholder="Internal notes about this candidate..."
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="proposed-salary">Proposed Salary</Label>
                        <Input
                          id="proposed-salary"
                          type="number"
                          value={submitForm.proposedSalary}
                          onChange={(e) => setSubmitForm({...submitForm, proposedSalary: e.target.value})}
                          placeholder="e.g., 75000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="start-date">Available Start Date</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={submitForm.availableStartDate}
                          onChange={(e) => setSubmitForm({...submitForm, availableStartDate: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
                    <Button onClick={handleSubmitCandidate} disabled={submitting || !submitForm.jobId}>
                      {submitting ? "Submitting..." : "Submit Candidate"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
</AppShell>
  );
  }

  // If user is not authenticated, show marketing page
  return (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div>
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Users className="h-12 w-12 text-primary" />
                  <Network className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Professional Network
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Connect. Collaborate. Grow Together.
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Build meaningful professional relationships with job seekers,
                recruiters, and industry leaders. Expand your network and unlock
                new opportunities through authentic connections.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Join the Network
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <Play className="mr-2 h-5 w-5" />
                  Explore Profiles
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary mb-2">
                  250K+
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Active professionals
                </p>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary mb-2">15K+</div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Daily connections made
                </p>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary mb-2">89%</div>
                <p className="text-xs sm:text-sm text-muted-foreground">Response rate</p>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary mb-2">50+</div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Countries represented
                </p>
              </div>
            </div>

            {/* Featured Professionals using PeopleCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Meet Our Community
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {people.slice(0, 3).map((person) => {
                  const personMetadata = {
                    id: person.id || "",
                    slug: person.slug || "",
                    firstName: person.fullName?.split(" ")[0] || "",
                    lastName:
                      person.fullName?.split(" ").slice(1).join(" ") || "",
                    fullName: person.fullName || "",
                    avatar: person.avatar,
                    headline: person.headline,
                    location: person.location || "",
                    role: person.role, // Keep original role value for proper processing
                    visibility: "public" as const, // Default for public users
                    status: "active" as const, // Default status
                    companyId: "", // Not available in PublicUser
                    companyName: person.currentCompany || "",
                    createdAt: person.createdAt || "",
                    updatedAt: person.updatedAt || "",
                    lastActiveAt: person.updatedAt || "", // Use updatedAt as fallback
                    profileViews: person.profileViews || 0,
                    connectionCount: 0, // Not available in PublicUser
                    followerCount: 0, // Not available in PublicUser
                    emailConfirmed: person.emailConfirmed || false,
                    isPro: person.isPro || false,
                    openToWork: person.openToWork || false,
                    experienceLevel: getExperienceLevel(person),
                    currentPosition: getCurrentPosition(person),
                    currentCompany: person.currentCompany || "",
                    ownership: "tracked" as const,
                  };

                  return <PeopleCard key={person.id} person={personMetadata} />;
                })}
              </div>
              <div className="text-center mt-8">
                <Link to="/signup">
                  <Button variant="outline" size="lg">
                    View All Professionals
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features and How It Works sections remain the same */}
            {/* ... (keeping the existing marketing content) ... */}

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                Ready to Expand Your Professional Network?
              </h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals who are building meaningful
                connections and advancing their careers.
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Start Networking Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
</div>
</AppShell>
  );
}
