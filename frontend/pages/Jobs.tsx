import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import {
  Briefcase,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Search,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle2,
  Play,
  TrendingUp,
  Building2,
  Target,
  Zap,
  BarChart3,
  Plus,
  Bookmark,
  FileText,
  Bell,
  Trash2,
  ExternalLink,
  Calendar,
  Edit,
  Eye,
} from "lucide-react";
import { Fragment, useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { useTimeAgo } from "@/hooks/use-time-ago";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  JOB_APPLICATION_STATUS_COLORS,
  JOB_ALERT_FREQUENCY_LABELS,
} from "@/lib/constants/enums";
import JobCard from "@/components/JobCard";
import JobAnalyticsDialog from "@/components/JobAnalyticsDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import ListsButton from "@/components/lists/ListsButton";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { listsService } from "@/lib/services/lists-service";
import Pagination, { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import {
  locationFilterFromQuery,
  applyLocationFilterToQuery,
} from "@/components/location/LocationFilter";
import LocationFilterButton from "@/components/location/LocationFilterButton";
import type { LocationFilter as LocationFilterValue } from "@/lib/services/locations-service";
import SectorFilterButton from "@/components/sector/SectorFilterButton";
import {
  sectorFilterFromQuery,
  applySectorFilterToQuery,
} from "@/components/sector/SectorFilter";
import { type Sector } from "@shared/sectors";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  jobService,
  type JobFilters,
  type JobSummary,
} from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";
import { useAuth, USER_ROLES } from "@/lib/auth";
import type { UserRole } from "@shared/user-roles";
import { canPostJobs } from "@/lib/persona";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";
import CreateJobAlertButton from "@/components/CreateJobAlertButton";
import AdSlot from "@/components/ads/AdSlot";
import CandidatesPanel, {
  CandidatesHeaderActions,
} from "@/components/recruit/CandidatesPanel";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { writeEntityHubActiveTab } from "@/components/EntityHubTabStrip";
import { useJobsTabs } from "@/hooks/use-jobs-tabs";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { recruitService } from "@/lib/services/recruit-service";

// Schemas
const JobApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  userId: z.string(),
  resumeId: z.string(),
  coverLetter: z.string().optional(),
  status: z.string(),
  appliedAt: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    company: z.string().optional(),
    location: z.string().optional(),
    employmentType: z.string().optional(),
  }),
  resume: z
    .object({
      id: z.string(),
      title: z.string(),
    })
    .optional(),
});

const JobAlertSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  searchCriteria: z.string(),
  alertFrequency: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  lastTriggered: z.string().optional().nullable(),
});

type JobApplication = z.infer<typeof JobApplicationSchema>;
type JobAlert = z.infer<typeof JobAlertSchema>;

// Saved jobs are returned by the API as flat JobSummary entities
// (see GET /api/Job/saved → jobService.getSavedJobs()).
type SavedJob = JobSummary;

export default function Jobs() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Single tab axis: jobs (browse), saved, applications, alerts, candidates.
  // The legacy ?section=candidates and ?tab=browse URLs still resolve here so
  // bookmarks survive. "browse" maps to "jobs" since the dedicated Browse
  // sub-tab is gone — the Jobs tab itself owns the browse surface now.
  const rawTab = searchParams.get("tab") ?? searchParams.get("section");
  const activeTab: "jobs" | "saved" | "applications" | "alerts" | "candidates" | "posted" =
    rawTab === "saved" ? "saved" :
    rawTab === "applications" ? "applications" :
    rawTab === "alerts" ? "alerts" :
    rawTab === "candidates" ? "candidates" :
    rawTab === "posted" ? "posted" :
    "jobs";
  const location = useLocation();
  // SEO for jobs page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.jobs"), url: "/jobs" }]);
  const { isAuthenticated, user } = useAuth();
  // `effective` applies the 2-char threshold so single-keystroke ?q=A
  // doesn't fire a full /api/jobs/public fanout. Raw value isn't needed
  // here — the header search component renders its own input from the
  // URL, this page only consumes the resolved filter.
  const { effective: urlQuery } = useSearchQueryParam();
  const urlEmploymentType = searchParams.get("employmentType") ?? "";
  const urlExperienceLevel = searchParams.get("experienceLevel") ?? "";
  const urlRemote = searchParams.get("remote") ?? "";
  const urlSalaryMin = searchParams.get("salaryMin") ?? "";
  const urlSalaryMax = searchParams.get("salaryMax") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  useHeaderFilters([
    {
      key: "employmentType",
      label: t("labels.employmentType"),
      type: "select",
      options: [
        { value: "full-time", label: t("labels.employmentType.fullTime") },
        { value: "part-time", label: t("labels.employmentType.partTime") },
        { value: "contract", label: t("labels.employmentType.contract") },
        { value: "internship", label: t("labels.employmentType.internship") },
      ],
    },
    {
      key: "experienceLevel",
      label: t("labels.experienceLevel"),
      type: "select",
      options: [
        { value: "entry", label: t("labels.experienceLevelLower.entry") },
        { value: "mid", label: t("labels.experienceLevelLower.mid") },
        { value: "senior", label: t("labels.experienceLevelLower.senior") },
        { value: "executive", label: t("labels.experienceLevel.executive") },
      ],
    },
    { key: "salary", label: t("labels.salaryRangeLabel"), type: "number-range" },
  ]);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlEmploymentType) initial.employmentType = urlEmploymentType;
    if (urlExperienceLevel) initial.experienceLevel = urlExperienceLevel;
    if (urlRemote) initial.remote = urlRemote === "true";
    if (urlSalaryMin) initial.salaryMin = parseInt(urlSalaryMin, 10);
    if (urlSalaryMax) initial.salaryMax = parseInt(urlSalaryMax, 10);
    if (urlLocation) initial.location = urlLocation;
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => ({
      ...prev,
      search: urlQuery,
      employmentType: urlEmploymentType || undefined,
      experienceLevel: urlExperienceLevel || undefined,
      remote: urlRemote ? urlRemote === "true" : undefined,
      salaryMin: urlSalaryMin ? parseInt(urlSalaryMin, 10) : undefined,
      salaryMax: urlSalaryMax ? parseInt(urlSalaryMax, 10) : undefined,
      location: urlLocation || undefined,
    }));
  }, [
    urlQuery,
    urlEmploymentType,
    urlExperienceLevel,
    urlRemote,
    urlSalaryMin,
    urlSalaryMax,
    urlLocation,
  ]);
  // Structured geo filter — wired into URL so deep-links share state.
  // Falls back to the existing free-text `location` searchParam for
  // backwards compatibility with old saved searches + email-alert links.
  // Declared above fetchJobs so the effect deps array sees it in scope.
  const [geoFilter, setGeoFilter] = useState<LocationFilterValue>(() =>
    locationFilterFromQuery(searchParams),
  );
  useEffect(() => {
    setGeoFilter(locationFilterFromQuery(searchParams));
  }, [searchParams]);
  const handleGeoFilterChange = (next: LocationFilterValue) => {
    setGeoFilter(next);
    const params = new URLSearchParams(searchParams);
    applyLocationFilterToQuery(params, next);
    setSearchParams(params);
  };

  // Sector filter (#1168). URL-bound so deep-links share state. Reuses
  // the partial sector index from migration 0112 server-side.
  const [sectorFilter, setSectorFilter] = useState<Sector | null>(() =>
    sectorFilterFromQuery(searchParams),
  );
  useEffect(() => {
    setSectorFilter(sectorFilterFromQuery(searchParams));
  }, [searchParams]);
  const handleSectorFilterChange = (next: Sector | null) => {
    setSectorFilter(next);
    const params = applySectorFilterToQuery(searchParams, next);
    setSearchParams(params);
  };

  const [viewMode, setViewMode] = useViewMode(
    "jobs.browse",
    "grid",
    BROWSE_VIEW_MODES,
  );
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  // Lists filter — same pattern as People page. Null = no filter; Set = restrict.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [candidateCount, setCandidateCount] = useState<number>(0);
  // Candidates tab — lifted scope so the company picker + import buttons
  // can sit in the PageHeader actions slot (next to "Post Job") while the
  // CandidatesPanel body reads the same companyId. The nonce kicks the
  // panel to refetch after the lifted import controls add a row.
  const {
    scope: candidatesScope,
    companyId: candidatesCompanyId,
    setCompanyId: setCandidatesCompanyId,
  } = useCurrentCompanyScope();
  const [candidatesRefreshNonce, setCandidatesRefreshNonce] = useState(0);
  // Hub tab strip — must call unconditionally (rules of hooks). Returns
  // [] for unauthenticated viewers, who never reach the authed branch.
  const topTabs = useJobsTabs({ totalJobs, candidateCount });
  // Remember the user's current tab so the strip on /jobs/:id /
  // /jobs/edit/:id / /jobs/create surfaces keeps it highlighted.
  useEffect(() => {
    writeEntityHubActiveTab("job", activeTab);
  }, [activeTab]);

  // Saved Jobs state
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [savedJobsLoading, setSavedJobsLoading] = useState(false);

  // Applications state
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  // Job Alerts state
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  // Per-job action dialogs — owner-only menu items on JobCard funnel
  // through these. Each dialog renders once at the bottom of the page
  // (Radix portals so they survive any re-render in the grid).
  const [deleteJobDialog, setDeleteJobDialog] = useState<{ id: string; title: string } | null>(null);
  const [qrJob, setQrJob] = useState<{ id: string; title: string } | null>(null);
  const [toolHistoryJob, setToolHistoryJob] = useState<{ id: string; title: string } | null>(null);
  // #411 — Job analytics dialog mount target. Set by JobActionsMenu's
  // Analytics entry; cleared on close.
  const [analyticsJob, setAnalyticsJob] = useState<{ id: string; title: string } | null>(null);
  const [editAlert, setEditAlert] = useState<JobAlert | null>(null);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);

  // Alert form state
  const [alertName, setAlertName] = useState("");
  const [alertKeywords, setAlertKeywords] = useState("");
  const [alertLocation, setAlertLocation] = useState("");
  const [alertFrequency, setAlertFrequency] = useState("daily");
  const [isSubmittingAlert, setIsSubmittingAlert] = useState(false);

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
  } = usePagination(totalJobs, 9);

  // Fetch jobs data
  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: JobFilters = {
        search: searchFilters.search || undefined,
        // Free-text `location` is now the legacy fallback — when the
        // viewer picks something in the LocationFilter the structured
        // ids below take over.
        location: geoFilter.text || searchFilters.location || undefined,
        countryId: geoFilter.countryId ?? undefined,
        stateId: geoFilter.stateId ?? undefined,
        cityId: geoFilter.cityId ?? undefined,
        radiusKm: geoFilter.radiusKm ?? undefined,
        employmentType: searchFilters.employmentType || undefined,
        experienceLevel: searchFilters.experienceLevel || undefined,
        isRemote: geoFilter.remote ?? searchFilters.remote ?? undefined,
        sector: sectorFilter ?? undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await jobService.getPublicJobs(filters);
      setJobs(result.items);
      setTotalJobs(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError(t("errors.loadJobsFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch jobs when filters or page changes
  useEffect(() => {
    fetchJobs();
  }, [searchFilters, geoFilter, sectorFilter, currentPage, itemsPerPage]);

  // Lists filter: load list membership when ?list_id changes.
  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "job")
      .then((res) => {
        if (cancelled) return;
        setListMembership(new Set(res.items.map((i) => i.entityId)));
      })
      .catch(() => {
        if (cancelled) return;
        setListMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listIdFromUrl]);

  const displayedJobs = useMemo(
    () =>
      listMembership ? jobs.filter((j) => listMembership.has(j.id)) : jobs,
    [jobs, listMembership],
  );

  // Load data based on active tab
  useEffect(() => {
    if (!isAuthenticated) return;

    if (activeTab === "saved") {
      loadSavedJobs();
    } else if (activeTab === "applications") {
      loadApplications();
    } else if (activeTab === "alerts") {
      loadAlerts();
    }
  }, [activeTab, isAuthenticated]);

  // Pre-fetch the candidate count for recruiters/employers so the Candidates
  // tab badge is accurate before the user clicks into it. The panel itself
  // re-fetches when mounted — this is just a lightweight warm-up for the badge.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.role !== USER_ROLES.RECRUITER && user.role !== USER_ROLES.EMPLOYER) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await recruitService.listCandidateResumes();
        if (!cancelled) setCandidateCount(rows.length);
      } catch {
        // Recruiter without a company yet — leave count at 0.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  // #676: Track/untrack is handled inside JobCard via `useTrackedJobs` +
  // jobService.saveJob/unsaveJob (optimistic, with extension event fire).
  // The page used to wrap that with a re-fetch on every click which (a)
  // double-saved, (b) re-painted 9 cards per save, and (c) swallowed
  // errors silently. Letting the card own it means a failed save rolls
  // back the bookmark icon naturally.

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next);
  };

  // Saved Jobs handlers
  const loadSavedJobs = async () => {
    try {
      setSavedJobsLoading(true);
      const jobs = await jobService.getSavedJobs();
      setSavedJobs(jobs);
    } catch {
      toast.error(t("messages.failedToLoadSavedJobs"));
    } finally {
      setSavedJobsLoading(false);
    }
  };

  const handleUnsaveJob = async (jobId: string) => {
    try {
      await jobService.unsaveJob(jobId);
      setSavedJobs((prev) => prev.filter((job) => job.id !== jobId));
      toast.success(t("messages.jobRemovedFromSaved"));
    } catch {
      toast.error(t("messages.failedToRemoveJob"));
    }
  };

  // Applications handlers
  const loadApplications = async () => {
    try {
      setApplicationsLoading(true);
      const response = await apiClient.get<JobApplication[]>(
        "/api/Job/applications",
        z.array(JobApplicationSchema)
      );
      setApplications(response.data);
    } catch {
      toast.error(t("messages.failedToLoadApplications"));
    } finally {
      setApplicationsLoading(false);
    }
  };

  // Job Alerts handlers
  const loadAlerts = async () => {
    try {
      setAlertsLoading(true);
      const response = await apiClient.get<JobAlert[]>(
        "/api/Job/alerts",
        z.array(JobAlertSchema)
      );
      setAlerts(response.data);
    } catch {
      toast.error(t("messages.failedToLoadJobAlerts"));
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleToggleActive = async (alertId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/api/Job/alerts/${alertId}/toggle`, {
        isActive: !currentStatus,
      });
      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === alertId ? { ...alert, isActive: !currentStatus } : alert
        )
      );
      toast.success(t(!currentStatus ? "messages.alertActivated" : "messages.alertDeactivated"));
    } catch {
      toast.error(t("messages.failedToUpdateAlertStatus"));
    }
  };

  const handleDeleteAlert = async () => {
    if (!deleteAlertId) return;

    try {
      await apiClient.delete(`/api/Job/alerts/${deleteAlertId}`);
      setAlerts((prev) => prev.filter((alert) => alert.id !== deleteAlertId));
      toast.success(t("messages.jobAlertDeleted"));
    } catch {
      toast.error(t("messages.failedToDeleteAlert"));
    } finally {
      setDeleteAlertId(null);
    }
  };

  // Owner-side job mutation funneled here so every JobCard call site can
  // share the same handler. Confirmation dialog is mounted at the bottom
  // of the page; clicking confirm calls jobService.deleteJob and removes
  // the row from the visible grid optimistically.
  const handleConfirmDeleteJob = async () => {
    if (!deleteJobDialog) return;
    const { id, title } = deleteJobDialog;
    try {
      await jobService.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setSavedJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success(t("messages.entityDeleted", { name: title }));
    } catch (err) {
      toast.error(t("messages.failedToDeleteJob"));
      console.error("Failed to delete job", err);
    } finally {
      setDeleteJobDialog(null);
    }
  };


  const handleEditAlert = (alert: JobAlert) => {
    setEditAlert(alert);
    setAlertName(alert.name);

    // Parse search criteria
    const parts = alert.searchCriteria.split("|").map((p) => p.trim());
    setAlertKeywords(parts[0] || "");

    const locationPart = parts.find((p) => p.startsWith("Location:"));
    setAlertLocation(
      locationPart ? locationPart.replace("Location:", "").trim() : ""
    );

    setAlertFrequency(alert.alertFrequency);
    setAlertSheetOpen(true);
  };

  const handleSubmitAlert = async () => {
    if (!editAlert) return;

    if (!alertName.trim()) {
      toast.error(t("messages.pleaseProvideAlertName"));
      return;
    }

    setIsSubmittingAlert(true);
    try {
      await apiClient.put(`/api/Job/alerts/${editAlert.id}`, {
        name: alertName.trim(),
        keywords: alertKeywords.trim() || undefined,
        location: alertLocation.trim() || undefined,
        frequency: alertFrequency,
      });
      toast.success(t("messages.jobAlertUpdated"));
      setAlertSheetOpen(false);
      setEditAlert(null);
      loadAlerts();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("messages.failedToUpdateJobAlert");
      toast.error(errorMessage);
    } finally {
      setIsSubmittingAlert(false);
    }
  };

  const parseSearchCriteria = (criteria: string) => {
    const parts = criteria.split("|").map((p) => p.trim());
    const keywords = parts[0] || "";
    const location = parts
      .find((p) => p.startsWith("Location:"))
      ?.replace("Location:", "")
      .trim();
    return { keywords, location };
  };

  // #635 — formatDate + getTimeAgo extracted to `useTimeAgo` so the
  // locale and labels respect i18next instead of returning hardcoded
  // English strings. Shared with any future surface that renders dates.
  const { formatDate, getTimeAgo } = useTimeAgo();

  // If user is authenticated, show the actual jobs page
  if (isAuthenticated && user) {
    // Capability lives in persona.ts (single SA-bypass rule). canPostJobs
    // covers recruiter / employer / admin and SA bypasses; ALSO used to
    // gate the Post-a-Job button and Candidates / Posted tabs.
    const canManageJobs = canPostJobs(user.role as UserRole);

    // Hiring-side-only tabs collapse to "jobs" for non-hiring viewers so
    // a stale ?tab=… URL doesn't render an empty agency panel.
    const HIRING_ONLY: ReadonlyArray<string> = ["candidates", "posted"];
    const effectiveTab =
      HIRING_ONLY.includes(activeTab) && !canManageJobs ? "jobs" : activeTab;

    // Per-card menu handlers — one factory keeps every JobCard mount in
    // sync (Posted grid, Tracked grid, All Jobs grid). Owner-only items
    // collapse to undefined when the viewer can't manage jobs, so
    // JobActionsMenu hides them automatically (self-gating per DRY rule).
    const jobMenuHandlersFor = (job: { id: string; title: string }) => ({
      onShowQR: () => setQrJob({ id: job.id, title: job.title }),
      onViewToolHistory: canManageJobs
        ? () => setToolHistoryJob({ id: job.id, title: job.title })
        : undefined,
      onViewAnalytics: canManageJobs
        ? () => setAnalyticsJob({ id: job.id, title: job.title })
        : undefined,
      onDelete: canManageJobs
        ? () => setDeleteJobDialog({ id: job.id, title: job.title })
        : undefined,
    });

    // One card definition shared by the Scroll and Grid views so the full
    // handler wiring lives in a single place (Table renders its own dense
    // rows below).
    const renderJobCard = (job: JobSummary) => {
      const jobMetadata = {
        id: job.id,
        slug: (job as any).slug || "",
        title: job.title,
        company: job.company,
        companyId: (job as any).companyId || "",
        location: job.location,
        description: (job as any).description || "",
        salary:
          job.salaryMin && job.salaryMax
            ? `$${(job.salaryMin / 1000).toFixed(0)}k - $${(job.salaryMax / 1000).toFixed(0)}k`
            : undefined,
        employmentType: job.employmentType,
        experienceLevel: (job as any).experienceLevel || "entry",
        postedDate: job.postedDate || "",
        isRemote: job.isRemote || false,
        status: "active" as const,
        privacy: "public" as const,
        views: (job as any).views || 0,
        applications: (job as any).applications || 0,
        createdAt: (job as any).createdAt || "",
        updatedAt: (job as any).updatedAt || "",
        summary: (job as any).summary || "",
        userId: (job as any).userId || "",
      };
      return (
        <JobCard
          key={job.id}
          job={jobMetadata}
          extraMenuItems={
            <AddToListMenu
              entityType="job"
              entityId={job.id}
              entityLabel={job.title}
            />
          }
          {...jobMenuHandlersFor({ id: job.id, title: job.title })}
        />
      );
    };

    return (
      <AppShell bgClassName="bg-background">
        <div className="p-4 md:p-6">
            <div>
              {/* Ad banner — free tier only. AdSlot self-centers and returns
                  null for Pro users, so no wrapper / no spacing eats the
                  layout for non-ad audiences. */}
              <AdSlot slot="jobs-banner" size="banner" className="mb-4" />
              <PageHeader
                tabs={topTabs}
                activeTabKey={effectiveTab}
                search={<HeaderSearch />}
                actions={
                  <>
                    {canManageJobs && (
                      <Button asChild>
                        <Link to="/jobs/create">
                          <Plus className="h-4 w-4 mr-2" />
                          {t("actions.postJob")}
                        </Link>
                      </Button>
                    )}
                    {effectiveTab === "candidates" && canManageJobs && (
                      <CandidatesHeaderActions
                        scope={candidatesScope}
                        companyId={candidatesCompanyId}
                        onCompanyChange={setCandidatesCompanyId}
                        onImported={() => setCandidatesRefreshNonce((n) => n + 1)}
                      />
                    )}
                    {effectiveTab === "jobs" && (
                      <>
                        <SectorFilterButton
                          value={sectorFilter}
                          onChange={handleSectorFilterChange}
                        />
                        <LocationFilterButton
                          value={geoFilter}
                          onChange={handleGeoFilterChange}
                        />
                        <ViewModeToggle
                          value={viewMode}
                          onChange={setViewMode}
                          modes={BROWSE_VIEW_MODES}
                        />
                        <ListsButton entityType="job" />
                      </>
                    )}
                  </>
                }
              />

              {effectiveTab === "candidates" && canManageJobs ? (
                <CandidatesPanel
                  onCountChange={setCandidateCount}
                  hideHeaderControls
                  scopeOverride={candidatesScope}
                  companyIdOverride={candidatesCompanyId}
                  refreshNonce={candidatesRefreshNonce}
                />
              ) : effectiveTab === "posted" && canManageJobs ? (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    {t("headings.jobs.myPostings")}
                  </h2>
                  {/* Display owned jobs from the public-jobs grid filtered to
                      this user. The full company-scoped query lives in #401 —
                      until that backend filter ships, fall back to the
                      ownership marker on the existing payload. */}
                  {displayedJobs.filter((j) => (j as any).userId === user.id).length === 0 ? (
                    <div className="text-center py-12">
                      <Briefcase className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-xl font-semibold mb-2">{t("headings.jobs.noPostingsYet")}</h3>
                      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        {t("messages.jobs.postFirstJobDesc")}
                      </p>
                      <Button asChild>
                        <Link to="/jobs/create">
                          <Plus className="h-4 w-4 mr-2" />
                          {t("actions.postJob")}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayedJobs
                        .filter((j) => (j as any).userId === user.id)
                        .map((job) => {
                          const jobMetadata = {
                            id: job.id,
                            slug: (job as any).slug || "",
                            title: job.title,
                            company: job.company,
                            companyId: (job as any).companyId || "",
                            location: job.location,
                            description: (job as any).description || "",
                            employmentType: job.employmentType,
                            experienceLevel: (job as any).experienceLevel || "entry",
                            postedDate: job.postedDate || "",
                            isRemote: job.isRemote || false,
                            status: "active" as const,
                            privacy: "public" as const,
                            views: (job as any).views || 0,
                            applications: (job as any).applications || 0,
                            createdAt: (job as any).createdAt || "",
                            updatedAt: (job as any).updatedAt || "",
                            summary: (job as any).summary || "",
                            userId: (job as any).userId || "",
                          };
                          return (
                            <JobCard
                              key={job.id}
                              job={jobMetadata}
                              showOwnership
                              {...jobMenuHandlersFor({ id: job.id, title: job.title })}
                            />
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : (
              <Tabs value={effectiveTab} className="space-y-4 sm:space-y-6">
                {/* Jobs (browse) Tab */}
                <TabsContent value="jobs" className="space-y-6">
                {/* All Available Jobs — header omitted; the inline PageHeader
                    search slot already labels this surface as "Jobs". Owned
                    jobs surface in this grid via the per-row Edit affordance
                    (ownership marker on the public-jobs payload); the
                    dedicated "Your Job Postings" / "Tracked Jobs" groups
                    were removed in #396 because they hung off a wiring that
                    never ran. */}
                <div>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="animate-pulse">
                          <div className="bg-muted rounded-lg h-48" />
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <p className="text-red-600 mb-4">{error}</p>
                      <Button onClick={fetchJobs}>{t("actions.tryAgainCapital")}</Button>
                    </div>
                  ) : displayedJobs.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">
                        {listMembership
                          ? t("messages.jobs.noJobsInList")
                          : t("messages.jobs.noJobsFound")}
                      </p>
                      <Button onClick={() => setSearchFilters({})}>
                        {t("actions.clearFilters")}
                      </Button>
                    </div>
                  ) : (
                    viewMode === "table" ? (
                      <JobsTable jobs={displayedJobs} />
                    ) : viewMode === "scroll" ? (
                      <HorizontalScroller itemCount={displayedJobs.length}>
                        {displayedJobs.map((job) => (
                          <Fragment key={job.id}>{renderJobCard(job)}</Fragment>
                        ))}
                      </HorizontalScroller>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {displayedJobs.map((job) => renderJobCard(job))}
                      </div>
                    )
                  )}

                  {/* Pagination */}
                  {!isLoading && !error && jobs.length > 0 && (
                    <Pagination
                      currentPage={currentPage}
                      totalItems={totalJobs}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  )}
                </div>
                </TabsContent>

                {/* Saved Jobs Tab */}
                <TabsContent value="saved" className="space-y-4">
                  {savedJobsLoading ? (
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
                  ) : savedJobs.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Bookmark className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{t("headings.noSavedJobsYet")}</h2>
                        <p className="text-muted-foreground mb-6">
                          {t("messages.jobs.noSavedJobsDesc")}
                        </p>
                        <Button onClick={() => handleTabChange("jobs")}>
                          {t("actions.browseJobs")}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {savedJobs.map((savedJob) => {
                        const salary =
                          savedJob.salaryMin && savedJob.salaryMax
                            ? `$${savedJob.salaryMin.toLocaleString()} - $${savedJob.salaryMax.toLocaleString()}`
                            : savedJob.salaryMin
                              ? t("labels.jobs.salaryFromAmount", { amount: savedJob.salaryMin.toLocaleString() })
                              : savedJob.salaryMax
                                ? t("labels.jobs.salaryUpToAmount", { amount: savedJob.salaryMax.toLocaleString() })
                                : null;
                        return (
                          <Card key={savedJob.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <Link
                                    to={`/jobs/${savedJob.id}`}
                                    className="text-xl font-semibold hover:text-primary transition-colors"
                                  >
                                    {savedJob.title}
                                  </Link>
                                  {savedJob.company && (
                                    <p className="text-muted-foreground flex items-center gap-2 mt-1">
                                      <Briefcase className="h-4 w-4" />
                                      {savedJob.company}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleUnsaveJob(savedJob.id)}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="flex flex-wrap gap-4 mb-4">
                                {savedJob.location && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    {savedJob.location}
                                  </div>
                                )}
                                {salary && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <DollarSign className="h-4 w-4" />
                                    {salary}
                                  </div>
                                )}
                                {savedJob.employmentType && (
                                  <Badge variant="secondary">{savedJob.employmentType}</Badge>
                                )}
                              </div>

                              {savedJob.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                                  {savedJob.description}
                                </p>
                              )}

                              <div className="flex items-center justify-between pt-4 border-t">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {t("labels.savedDate", { date: formatDate(savedJob.createdAt ?? savedJob.postedDate ?? "") })}
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" asChild>
                                    <Link to={`/jobs/${savedJob.id}`}>{t("actions.viewDetailsAdmin")}</Link>
                                  </Button>
                                  <Button size="sm" asChild>
                                    <Link to={`/jobs/${savedJob.id}`}>{t("actions.applyNow")}</Link>
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Applications Tab */}
                <TabsContent value="applications" className="space-y-4">
                  {applicationsLoading ? (
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
                  ) : applications.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{t("headings.noApplicationsYet")}</h2>
                        <p className="text-muted-foreground mb-6">
                          {t("messages.noApplicationsDesc")}
                        </p>
                        <Button onClick={() => handleTabChange("jobs")}>
                          {t("actions.browseJobs")}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {applications.map((application) => (
                        <Card key={application.id} className="hover:shadow-lg transition-shadow">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <Link
                                  to={`/jobs/${application.jobId}`}
                                  className="text-xl font-semibold hover:text-primary transition-colors flex items-center gap-2"
                                >
                                  {application.job.title}
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                                {application.job.company && (
                                  <p className="text-muted-foreground flex items-center gap-2 mt-1">
                                    <Briefcase className="h-4 w-4" />
                                    {application.job.company}
                                  </p>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className={JOB_APPLICATION_STATUS_COLORS[application.status] || ""}
                              >
                                {application.status}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-4 mb-4">
                              {application.job.location && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <MapPin className="h-4 w-4" />
                                  {application.job.location}
                                </div>
                              )}
                              {application.job.employmentType && (
                                <Badge variant="secondary">{application.job.employmentType}</Badge>
                              )}
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                {t("labels.appliedDate", { date: formatDate(application.appliedAt) })}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {getTimeAgo(application.appliedAt)}
                              </div>
                            </div>

                            {application.resume && (
                              <div className="mb-4 p-3 bg-muted rounded-md">
                                <p className="text-sm font-medium mb-1">{t("labels.resumeUsed")}</p>
                                <Link
                                  to={`/resumes/${application.resumeId}`}
                                  className="text-sm text-primary hover:underline"
                                >
                                  {application.resume.title}
                                </Link>
                              </div>
                            )}

                            {application.coverLetter && (
                              <div className="mb-4 p-3 bg-muted rounded-md">
                                <p className="text-sm font-medium mb-1">{t("labels.coverLetterLabel")}</p>
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                  {application.coverLetter}
                                </p>
                              </div>
                            )}

                            <div className="flex gap-2 pt-4 border-t">
                              <Button variant="outline" size="sm" asChild>
                                <Link to={`/jobs/${application.jobId}`}>{t("actions.viewJob")}</Link>
                              </Button>
                              {application.resume && (
                                <Button variant="outline" size="sm" asChild>
                                  <Link to={`/resumes/${application.resumeId}`}>{t("actions.viewResume")}</Link>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Alerts Tab */}
                <TabsContent value="alerts" className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold">{t("headings.jobAlerts")}</h2>
                      <p className="text-muted-foreground">
                        {t("messages.alertsConfiguredCount", { count: alerts.length })}
                      </p>
                    </div>
                    <CreateJobAlertButton
                      onAlertCreated={loadAlerts}
                      variant="default"
                      size="default"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("actions.createAlert")}
                    </CreateJobAlertButton>
                  </div>

                  {alertsLoading ? (
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
                  ) : alerts.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Bell className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-bold mb-2">{t("headings.noJobAlertsYet")}</h2>
                        <p className="text-muted-foreground mb-6">
                          {t("messages.noJobAlertsDesc")}
                        </p>
                        <CreateJobAlertButton onAlertCreated={loadAlerts}>
                          <Plus className="h-4 w-4 mr-2" />
                          {t("actions.createYourFirstAlert")}
                        </CreateJobAlertButton>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {alerts.map((alert) => {
                        const { keywords, location } = parseSearchCriteria(alert.searchCriteria);
                        return (
                          <Card key={alert.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <CardTitle className="text-xl mb-2">{alert.name}</CardTitle>
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <Badge variant={alert.isActive ? "default" : "secondary"}>
                                      {alert.isActive ? t("labels.active") : t("labels.inactive")}
                                    </Badge>
                                    <Badge variant="outline">
                                      {JOB_ALERT_FREQUENCY_LABELS[alert.alertFrequency] || alert.alertFrequency}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={alert.isActive}
                                    onCheckedChange={() => handleToggleActive(alert.id, alert.isActive)}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditAlert(alert)}
                                  >
                                    <Edit className="h-5 w-5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeleteAlertId(alert.id)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                <div className="flex items-start gap-2">
                                  <Search className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium">{t("labels.keywordsLabel")}</p>
                                    <p className="text-sm text-muted-foreground">{keywords || t("labels.any")}</p>
                                  </div>
                                </div>
                                {location && (
                                  <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium">{t("labels.locationLabel")}</p>
                                      <p className="text-sm text-muted-foreground">{location}</p>
                                    </div>
                                  </div>
                                )}
                                <div className="pt-3 border-t text-xs text-muted-foreground">
                                  {t("labels.createdDate", { date: formatDate(alert.createdAt) })}
                                  {alert.lastTriggered && (
                                    <> {t("labels.lastTriggeredDateInline", { date: formatDate(alert.lastTriggered) })}</>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              )}

              {/* Edit Alert Sheet */}
              <Sheet open={alertSheetOpen} onOpenChange={setAlertSheetOpen}>
                <SheetContent side="right" className="sm:max-w-[500px]">
                  <SheetHeader>
                    <SheetTitle>{t("headings.editJobAlert")}</SheetTitle>
                    <SheetDescription>
                      {t("messages.jobs.editAlertDescription")}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="alert-name">{t("fields.alertNameRequired.label")}</Label>
                      <Input
                        id="alert-name"
                        placeholder={t("fields.alertName.placeholder")}
                        value={alertName}
                        onChange={(e) => setAlertName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="keywords">{t("fields.keywordsRequired.label")}</Label>
                      <Input
                        id="keywords"
                        placeholder={t("fields.keywords.placeholder")}
                        value={alertKeywords}
                        onChange={(e) => setAlertKeywords(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("messages.separateKeywordsWithCommas")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">{t("fields.locationOptional.label")}</Label>
                      <Input
                        id="location"
                        placeholder={t("fields.alertLocation.placeholder")}
                        value={alertLocation}
                        onChange={(e) => setAlertLocation(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="frequency">{t("fields.notificationFrequency.label")}</Label>
                      <Select value={alertFrequency} onValueChange={setAlertFrequency}>
                        <SelectTrigger id="frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">{t("labels.frequency.immediate")}</SelectItem>
                          <SelectItem value="daily">{t("labels.frequency.daily")}</SelectItem>
                          <SelectItem value="weekly">{t("labels.frequency.weekly")}</SelectItem>
                          <SelectItem value="monthly">{t("labels.frequency.monthly")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <SheetFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAlertSheetOpen(false)}
                      disabled={isSubmittingAlert}
                    >
                      {t("actions.cancel")}
                    </Button>
                    <Button onClick={handleSubmitAlert} disabled={isSubmittingAlert}>
                      {isSubmittingAlert ? t("status.updating") : t("actions.updateAlert")}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              {/* Delete Alert Dialog */}
              <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("headings.deleteJobAlert")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("messages.jobs.deleteAlertConfirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAlert} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {t("actions.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* #411 — Job analytics dialog, mounted by JobActionsMenu's
                  Analytics entry. */}
              {analyticsJob && (
                <JobAnalyticsDialog
                  isOpen={!!analyticsJob}
                  onClose={() => setAnalyticsJob(null)}
                  jobId={analyticsJob.id}
                  jobTitle={analyticsJob.title}
                />
              )}

              {/* Delete Job confirmation — owner-only via the JobActionsMenu Delete entry. */}
              <AlertDialog open={!!deleteJobDialog} onOpenChange={(open) => !open && setDeleteJobDialog(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("headings.jobs.deleteJobTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {deleteJobDialog
                        ? t("messages.jobs.deleteJobConfirm", { title: deleteJobDialog.title })
                        : t("messages.jobs.actionCannotBeUndone")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleConfirmDeleteJob}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("actions.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* QR Code dialog — Reuses the resume QR component since it just
                  renders any URL. */}
              {qrJob && (
                <QRCodeDialog
                  isOpen={!!qrJob}
                  onClose={() => setQrJob(null)}
                  url={`${window.location.origin}/jobs/${qrJob.id}`}
                  title={t("headings.jobs.qrCodeTitle", { title: qrJob.title })}
                  filename={`job-${qrJob.id}-qr`}
                />
              )}

              {/* Tool Run History side panel — owner-only on JobActionsMenu.
                  Shared sheet works for any entity type (resume / job / company). */}
              {toolHistoryJob && (
                <ToolHistorySheet
                  open={!!toolHistoryJob}
                  onOpenChange={(open) => !open && setToolHistoryJob(null)}
                  source={{ kind: "entity", entityType: "job", entityId: toolHistoryJob.id }}
                  entityName={toolHistoryJob.title}
                />
              )}
            </div>
          </div>
</AppShell>
  );
  }

  // If user is not authenticated, show marketing page
  return (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div>
          <div className="px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Briefcase className="h-12 w-12 text-primary" />
                  <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("labels.smartJobs")}
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                {t("headings.discoverPerfectCareerMatch")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                {t("messages.jobs.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.findYourDreamJob")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/signup?role=recruiter">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Plus className="mr-2 h-5 w-5" />
                    {t("actions.postAJob")}
                  </Button>
                </Link>
              </div>
              <div className="mt-4 text-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                >
                  <Play className="mr-2 h-4 w-4" />
                  {t("actions.seeHowItWorks")}
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">50K+</div>
                <p className="text-sm text-muted-foreground">
                  {t("labels.activeJobPostings")}
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">95%</div>
                <p className="text-sm text-muted-foreground">{t("labels.matchAccuracy")}</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">72h</div>
                <p className="text-sm text-muted-foreground">
                  {t("labels.averageResponseTime")}
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">89%</div>
                <p className="text-sm text-muted-foreground">
                  {t("labels.interviewSuccessRate")}
                </p>
              </div>
            </div>

            {/* Featured Jobs Preview using shared JobCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("headings.featuredOpportunities")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {jobs.slice(0, 2).map((job) => {
                  const jobMetadata = {
                    id: job.id,
                    slug: (job as any).slug || "",
                    title: job.title,
                    company: job.company,
                    companyId: (job as any).companyId || "",
                    location: job.location,
                    description: (job as any).description || "",
                    salary:
                      job.salaryMin && job.salaryMax
                        ? `$${(job.salaryMin / 1000).toFixed(0)}k - $${(job.salaryMax / 1000).toFixed(0)}k`
                        : undefined,
                    employmentType: job.employmentType,
                    experienceLevel: (job as any).experienceLevel || "entry",
                    postedDate: job.postedDate || "",
                    isRemote: job.isRemote || false,
                    status: "active" as const,
                    privacy: "public" as const,
                    views: (job as any).views || 0,
                    applications: (job as any).applications || 0,
                    createdAt: (job as any).createdAt || "",
                    updatedAt: (job as any).updatedAt || "",
                    summary: (job as any).summary || "",
                    userId: (job as any).userId || "",
                  };

                  return <JobCard key={job.id} job={jobMetadata} />;
                })}
              </div>
              <div className="text-center mt-8">
                <Link to="/signup">
                  <Button variant="outline" size="lg">
                    {t("actions.viewAllJobsCount")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features and other marketing content */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("headings.whyChooseJobPlatform")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>{t("headings.aiPoweredMatching")}</CardTitle>
                    <CardDescription>
                      {t("messages.jobs.aiMatchingDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Video className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>{t("headings.videoJobDescriptions")}</CardTitle>
                    <CardDescription>
                      {t("messages.jobs.videoDescriptionsDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Zap className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>{t("headings.directConnections")}</CardTitle>
                    <CardDescription>
                      {t("messages.jobs.directConnectionsDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Employer CTA */}
            <div className="mb-16">
              <div className="text-center bg-gradient-to-r from-green-50 to-blue-50 p-8 rounded-2xl border border-green-200/50">
                <Building2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-4">
                  {t("headings.jobs.hiringFindTalent")}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  {t("messages.jobs.employerCtaDesc")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup?role=recruiter">
                    <Button
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Plus className="mr-2 h-5 w-5" />
                      {t("actions.postFirstJobFree")}
                    </Button>
                  </Link>
                  <Link to="/for-recruiters">
                    <Button size="lg" variant="outline">
                      {t("actions.learnMoreAboutHiring")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                {t("headings.jobs.readyToFindJob")}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t("messages.jobs.finalCtaDesc")}
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  {t("actions.startJobSearchToday")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
</div>
</AppShell>
  );
}

// Dense rows-and-columns view for the Jobs browse surface — mirrors
// ResumeOwnedTable so the Scroll / Grid / Table trio stays visually
// consistent across browse pages. The job link reuses JobCard's default
// navigation target (`/jobs/:id`).
function JobsTable({ jobs }: { jobs: JobSummary[] }) {
  const { t } = useTranslation();
  const { formatDate } = useTimeAgo();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.title", "Title")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.company", "Company")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.location", "Location")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.type", "Type")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.posted", "Posted")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="px-3 py-2">
                <Link
                  to={`/jobs/${job.id}`}
                  className="font-medium hover:text-brand-purple"
                >
                  {job.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {job.company || "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {job.isRemote ? (
                    <>
                      <Building2 className="h-3.5 w-3.5" />
                      {t("labels.remote", "Remote")}
                    </>
                  ) : job.location ? (
                    <>
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {job.employmentType ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {job.employmentType}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {job.postedDate ? formatDate(job.postedDate) : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/jobs/${job.id}`}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t("actions.view", "View")}
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
