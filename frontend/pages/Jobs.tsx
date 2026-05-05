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
  Users,
  Building2,
  Target,
  Zap,
  BarChart3,
  Plus,
  Filter,
  X,
  Bookmark,
  FileText,
  Bell,
  Trash2,
  ExternalLink,
  Calendar,
  Edit,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  JOB_APPLICATION_STATUS_COLORS,
  JOB_ALERT_FREQUENCY_LABELS,
} from "@/lib/constants/enums";
import JobCard from "@/components/JobCard";
import ListsButton from "@/components/lists/ListsButton";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { listsService } from "@/lib/services/lists-service";
import Pagination, { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import SearchBar from "@/components/SearchBar";
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
import type { JobWithOwnership } from "@/types/job";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";
import CreateJobAlertButton from "@/components/CreateJobAlertButton";
import AdSlot from "@/components/ads/AdSlot";
import CandidatesPanel from "@/components/recruit/CandidatesPanel";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import ViewModeToggle from "@/components/ViewModeToggle";
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
  const [searchParams, setSearchParams] = useSearchParams();
  // Single tab axis: jobs (browse), saved, applications, alerts, candidates.
  // The legacy ?section=candidates and ?tab=browse URLs still resolve here so
  // bookmarks survive. "browse" maps to "jobs" since the dedicated Browse
  // sub-tab is gone — the Jobs tab itself owns the browse surface now.
  const rawTab = searchParams.get("tab") ?? searchParams.get("section");
  const activeTab: "jobs" | "saved" | "applications" | "alerts" | "candidates" =
    rawTab === "saved" ? "saved" :
    rawTab === "applications" ? "applications" :
    rawTab === "alerts" ? "alerts" :
    rawTab === "candidates" ? "candidates" :
    "jobs";
  const location = useLocation();
  // SEO for jobs page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Jobs", url: "/jobs" }]);
  const { isAuthenticated, user } = useAuth();
  const urlQuery = searchParams.get("q") ?? "";
  const urlEmploymentType = searchParams.get("employmentType") ?? "";
  const urlExperienceLevel = searchParams.get("experienceLevel") ?? "";
  const urlRemote = searchParams.get("remote") ?? "";
  const urlSalaryMin = searchParams.get("salaryMin") ?? "";
  const urlSalaryMax = searchParams.get("salaryMax") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  useHeaderFilters([
    {
      key: "employmentType",
      label: "Employment type",
      type: "select",
      options: [
        { value: "full-time", label: "Full-time" },
        { value: "part-time", label: "Part-time" },
        { value: "contract", label: "Contract" },
        { value: "internship", label: "Internship" },
      ],
    },
    {
      key: "experienceLevel",
      label: "Experience level",
      type: "select",
      options: [
        { value: "entry", label: "Entry level" },
        { value: "mid", label: "Mid level" },
        { value: "senior", label: "Senior level" },
        { value: "executive", label: "Executive" },
      ],
    },
    { key: "remote", label: "Remote", type: "boolean" },
    { key: "salary", label: "Salary range", type: "number-range" },
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  // Lists filter — same pattern as People page. Null = no filter; Set = restrict.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [jobsData, setJobsData] = useState<{
    owned: JobWithOwnership[];
    tracked: JobWithOwnership[];
  }>({
    owned: [],
    tracked: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [candidateCount, setCandidateCount] = useState<number>(0);

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
        location: searchFilters.location || undefined,
        employmentType: searchFilters.employmentType || undefined,
        experienceLevel: searchFilters.experienceLevel || undefined,
        isRemote: searchFilters.remote || undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await jobService.getPublicJobs(filters);
      setJobs(result.items);
      setTotalJobs(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError("Failed to load jobs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch jobs when filters or page changes
  useEffect(() => {
    fetchJobs();
  }, [searchFilters, currentPage, itemsPerPage]);

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

  // Handle job tracking
  const handleTrackJob = async (jobId: string) => {
    if (user) {
      try {
        await jobService.saveJob(jobId);
        // Refresh jobs to show updated state
        await fetchJobs();
      } catch (error) {
        console.error("Failed to save job:", error);
      }
    }
  };

  const handleUntrackJob = async (jobId: string) => {
    if (user) {
      try {
        await jobService.unsaveJob(jobId);
        // Refresh jobs to show updated state
        await fetchJobs();
      } catch (error) {
        console.error("Failed to unsave job:", error);
      }
    }
  };

  const handleSearch = (query: string) => {
    setSearchFilters((prev) => ({ ...prev, search: query }));
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({});
  };

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
      toast.error("Failed to load saved jobs");
    } finally {
      setSavedJobsLoading(false);
    }
  };

  const handleUnsaveJob = async (jobId: string) => {
    try {
      await jobService.unsaveJob(jobId);
      setSavedJobs((prev) => prev.filter((job) => job.id !== jobId));
      toast.success("Job removed from saved");
    } catch {
      toast.error("Failed to remove job");
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
      toast.error("Failed to load applications");
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
      toast.error("Failed to load job alerts");
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
      toast.success(!currentStatus ? "Alert activated" : "Alert deactivated");
    } catch {
      toast.error("Failed to update alert status");
    }
  };

  const handleDeleteAlert = async () => {
    if (!deleteAlertId) return;

    try {
      await apiClient.delete(`/api/Job/alerts/${deleteAlertId}`);
      setAlerts((prev) => prev.filter((alert) => alert.id !== deleteAlertId));
      toast.success("Job alert deleted");
    } catch {
      toast.error("Failed to delete alert");
    } finally {
      setDeleteAlertId(null);
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
      toast.error("Please provide an alert name");
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
      toast.success("Job alert updated successfully!");
      setAlertSheetOpen(false);
      setEditAlert(null);
      loadAlerts();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update job alert";
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  // Temporary stub until owned/tracked jobs are wired
  const getJobsForUser = (): {
    owned: JobWithOwnership[];
    tracked: JobWithOwnership[];
  } => {
    return { owned: [], tracked: [] };
  };

  // Load user's jobs when authenticated - only when needed
  const loadUserJobsOnDemand = async () => {
    if (!isAuthenticated || !user) return;

    try {
      setIsLoading(true);
      // Get user's owned and tracked jobs
      const ownedJobs = await jobService.getUserJobs();
      const trackedJobs = await jobService.getSavedJobs();

      setJobsData({
        owned: ownedJobs.map((j) => ({
          ...j,
          company: j.company ?? "",
          location: j.location ?? "",
          employmentType: j.employmentType ?? "",
          ownership: "owned" as const,
          slug: (j as any).slug || "",
          experienceLevel: (j as any).experienceLevel || "entry",
          status: "active" as const,
          privacy: "public" as const,
          description: (j as any).description || "",
          views: (j as any).views || 0,
          applications: (j as any).applications || 0,
          summary: (j as any).summary || "",
          userId: (j as any).userId || "",
          createdAt: (j as any).createdAt || "",
          updatedAt: (j as any).updatedAt || "",
        })),
        tracked: trackedJobs.map((j) => ({
          ...j,
          company: j.company ?? "",
          location: j.location ?? "",
          employmentType: j.employmentType ?? "",
          ownership: "tracked" as const,
          slug: (j as any).slug || "",
          experienceLevel: (j as any).experienceLevel || "entry",
          status: "active" as const,
          privacy: "public" as const,
          description: (j as any).description || "",
          views: (j as any).views || 0,
          applications: (j as any).applications || 0,
          summary: (j as any).summary || "",
          userId: (j as any).userId || "",
          createdAt: (j as any).createdAt || "",
          updatedAt: (j as any).updatedAt || "",
        })),
      });
    } catch (error) {
      console.error("Failed to load user jobs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Only load user jobs when specifically needed (not on every page load)
  // This prevents the unnecessary /api/Job/saved API call
  // useEffect(() => {
  //   if (isAuthenticated && user) {
  //     loadUserJobsOnDemand();
  //   }
  // }, [isAuthenticated, user]);

  // If user is authenticated, show the actual jobs page
  if (isAuthenticated && user) {
    const isJobSeeker = user.role === USER_ROLES.JOB_SEEKER;
    const isRecruiterOrEmployer =
      user.role === USER_ROLES.RECRUITER || user.role === USER_ROLES.EMPLOYER;

    // Candidates is recruiter/employer only — collapse to "jobs" otherwise so
    // a stale ?tab=candidates URL doesn't render an empty agency panel.
    const effectiveTab = activeTab === "candidates" && !isRecruiterOrEmployer ? "jobs" : activeTab;

    const topTabs: PageHeaderTab[] = [
      { key: "jobs", label: "Jobs", icon: Briefcase, to: "/jobs", badge: totalJobs },
      { key: "saved", label: "Saved", icon: Bookmark, to: "/jobs?tab=saved" },
      { key: "applications", label: "Applications", icon: FileText, to: "/jobs?tab=applications" },
      { key: "alerts", label: "Alerts", icon: Bell, to: "/jobs?tab=alerts" },
      ...(isRecruiterOrEmployer
        ? [
            {
              key: "candidates",
              label: "Candidates",
              icon: Users,
              to: "/jobs?tab=candidates",
              badge: candidateCount,
            } satisfies PageHeaderTab,
          ]
        : []),
    ];

    return (
      <AppShell bgClassName="bg-background">
        <div className="p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Ad banner — free tier only */}
              <div className="flex justify-center mb-4">
                <AdSlot slot="jobs-banner" size="banner" />
              </div>
              <PageHeader
                tabs={topTabs}
                activeTabKey={effectiveTab}
                title="Jobs"
                description={
                  isJobSeeker
                    ? "Discover and track job opportunities that match your skills"
                    : "Manage your job postings and discover talent"
                }
                actions={
                  <>
                    {isRecruiterOrEmployer && (
                      <Button asChild>
                        <Link to="/jobs/create">
                          <Plus className="h-4 w-4 mr-2" />
                          Post Job
                        </Link>
                      </Button>
                    )}
                    {effectiveTab === "jobs" && (
                      <>
                        <ViewModeToggle value={viewMode} onChange={setViewMode} />
                        <ListsButton entityType="job" />
                      </>
                    )}
                  </>
                }
              />

              {effectiveTab === "candidates" && isRecruiterOrEmployer ? (
                <CandidatesPanel onCountChange={setCandidateCount} />
              ) : (
              <Tabs value={effectiveTab} className="space-y-4 sm:space-y-6">
                {/* Jobs (browse) Tab */}
                <TabsContent value="jobs" className="space-y-6">
                  <SearchBar
                    context="jobs"
                    value={searchFilters.search}
                    filters={searchFilters}
                    onSearch={handleSearch}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                    hideSearchInput
                    hideFilters
                  />

                  {/* Owned Jobs (for recruiters/employers) */}
                  {isRecruiterOrEmployer &&
                    "owned" in jobsData &&
                    jobsData.owned.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          Your Job Postings ({jobsData.owned.length})
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {jobsData.owned.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              showOwnership
                              onTrack={handleTrackJob}
                              onUntrack={handleUntrackJob}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Tracked Jobs */}
                  {("tracked" in jobsData
                    ? jobsData.tracked.length > 0
                    : false) && (
                    <div>
                      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Tracked Jobs ({(jobsData as any).tracked.length})
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        {(jobsData as any).tracked.map(
                          (job: JobWithOwnership) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              showOwnership
                              onTrack={handleTrackJob}
                              onUntrack={handleUntrackJob}
                            />
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {/* All Available Jobs */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    {isJobSeeker ? "Available Jobs" : "All Jobs"}
                  </h2>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="animate-pulse">
                          <div className="bg-gray-200 rounded-lg h-48" />
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <p className="text-red-600 mb-4">{error}</p>
                      <Button onClick={fetchJobs}>Try Again</Button>
                    </div>
                  ) : displayedJobs.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-600 mb-4">
                        {listMembership
                          ? "No jobs in this list match your filters."
                          : "No jobs found matching your criteria."}
                      </p>
                      <Button onClick={() => setSearchFilters({})}>
                        Clear Filters
                      </Button>
                    </div>
                  ) : (
                    <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
                      {displayedJobs.map((job) => {
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
                          experienceLevel:
                            (job as any).experienceLevel || "entry",
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
                            onTrack={handleTrackJob}
                            onUntrack={handleUntrackJob}
                            layout={viewMode === "list" ? "horizontal" : "vertical"}
                            extraMenuItems={
                              <AddToListMenu
                                entityType="job"
                                entityId={job.id}
                                entityLabel={job.title}
                              />
                            }
                          />
                        );
                      })}
                    </div>
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
                        <h2 className="text-2xl font-bold mb-2">No saved jobs yet</h2>
                        <p className="text-muted-foreground mb-6">
                          Start saving jobs you're interested in to keep track of them here
                        </p>
                        <Button onClick={() => handleTabChange("jobs")}>
                          Browse Jobs
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
                              ? `From $${savedJob.salaryMin.toLocaleString()}`
                              : savedJob.salaryMax
                                ? `Up to $${savedJob.salaryMax.toLocaleString()}`
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
                                  Saved {formatDate(savedJob.createdAt ?? savedJob.postedDate ?? "")}
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" asChild>
                                    <Link to={`/jobs/${savedJob.id}`}>View Details</Link>
                                  </Button>
                                  <Button size="sm" asChild>
                                    <Link to={`/jobs/${savedJob.id}`}>Apply Now</Link>
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
                        <h2 className="text-2xl font-bold mb-2">No applications yet</h2>
                        <p className="text-muted-foreground mb-6">
                          Start applying to jobs to track your applications here
                        </p>
                        <Button onClick={() => handleTabChange("jobs")}>
                          Browse Jobs
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
                                Applied {formatDate(application.appliedAt)}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {getTimeAgo(application.appliedAt)}
                              </div>
                            </div>

                            {application.resume && (
                              <div className="mb-4 p-3 bg-muted rounded-md">
                                <p className="text-sm font-medium mb-1">Resume Used:</p>
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
                                <p className="text-sm font-medium mb-1">Cover Letter:</p>
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                  {application.coverLetter}
                                </p>
                              </div>
                            )}

                            <div className="flex gap-2 pt-4 border-t">
                              <Button variant="outline" size="sm" asChild>
                                <Link to={`/jobs/${application.jobId}`}>View Job</Link>
                              </Button>
                              {application.resume && (
                                <Button variant="outline" size="sm" asChild>
                                  <Link to={`/resumes/${application.resumeId}`}>View Resume</Link>
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
                      <h2 className="text-2xl font-bold">Job Alerts</h2>
                      <p className="text-muted-foreground">
                        {alerts.length} {alerts.length === 1 ? "alert" : "alerts"} configured
                      </p>
                    </div>
                    <CreateJobAlertButton
                      onAlertCreated={loadAlerts}
                      variant="default"
                      size="default"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Alert
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
                        <h2 className="text-2xl font-bold mb-2">No job alerts yet</h2>
                        <p className="text-muted-foreground mb-6">
                          Create job alerts to get notified when new jobs match your criteria
                        </p>
                        <CreateJobAlertButton onAlertCreated={loadAlerts}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Your First Alert
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
                                      {alert.isActive ? "Active" : "Inactive"}
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
                                    <p className="text-sm font-medium">Keywords:</p>
                                    <p className="text-sm text-muted-foreground">{keywords || "Any"}</p>
                                  </div>
                                </div>
                                {location && (
                                  <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium">Location:</p>
                                      <p className="text-sm text-muted-foreground">{location}</p>
                                    </div>
                                  </div>
                                )}
                                <div className="pt-3 border-t text-xs text-muted-foreground">
                                  Created {formatDate(alert.createdAt)}
                                  {alert.lastTriggered && (
                                    <> • Last triggered {formatDate(alert.lastTriggered)}</>
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
                    <SheetTitle>Edit Job Alert</SheetTitle>
                    <SheetDescription>
                      Update your job alert settings to refine your notifications
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="alert-name">Alert Name *</Label>
                      <Input
                        id="alert-name"
                        placeholder="e.g., Senior Developer Jobs"
                        value={alertName}
                        onChange={(e) => setAlertName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="keywords">Keywords *</Label>
                      <Input
                        id="keywords"
                        placeholder="e.g., React, TypeScript, Node.js"
                        value={alertKeywords}
                        onChange={(e) => setAlertKeywords(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Separate multiple keywords with commas
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location (Optional)</Label>
                      <Input
                        id="location"
                        placeholder="e.g., San Francisco, CA"
                        value={alertLocation}
                        onChange={(e) => setAlertLocation(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="frequency">Notification Frequency</Label>
                      <Select value={alertFrequency} onValueChange={setAlertFrequency}>
                        <SelectTrigger id="frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Immediate</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
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
                      Cancel
                    </Button>
                    <Button onClick={handleSubmitAlert} disabled={isSubmittingAlert}>
                      {isSubmittingAlert ? "Updating..." : "Update Alert"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              {/* Delete Alert Dialog */}
              <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Job Alert</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this job alert? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAlert} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
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
                  <Briefcase className="h-12 w-12 text-primary" />
                  <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Smart Jobs
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Discover Your Perfect Career Match
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Find jobs that truly fit your skills and aspirations with
                AI-powered matching, video job descriptions, and direct
                connections to hiring managers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Find Your Dream Job
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/signup?role=recruiter">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Plus className="mr-2 h-5 w-5" />
                    Post a Job
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
                  See How It Works
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid md:grid-cols-4 gap-6 mb-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">50K+</div>
                <p className="text-sm text-muted-foreground">
                  Active job postings
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">95%</div>
                <p className="text-sm text-muted-foreground">Match accuracy</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">72h</div>
                <p className="text-sm text-muted-foreground">
                  Average response time
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">89%</div>
                <p className="text-sm text-muted-foreground">
                  Interview success rate
                </p>
              </div>
            </div>

            {/* Featured Jobs Preview using shared JobCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Featured Opportunities
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
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
                    View All 50,000+ Jobs
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features and other marketing content */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Why Choose Our Job Platform
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>AI-Powered Matching</CardTitle>
                    <CardDescription>
                      Our advanced AI analyzes your skills, experience, and
                      preferences to find jobs that truly match your career
                      goals.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Video className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Video Job Descriptions</CardTitle>
                    <CardDescription>
                      Get a real feel for the role with video job descriptions
                      from actual hiring managers and team members.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Zap className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Direct Connections</CardTitle>
                    <CardDescription>
                      Skip the black hole of traditional applications. Connect
                      directly with hiring managers and decision makers.
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
                  Hiring? Find Top Talent Fast
                </h3>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  Post your job openings and connect with qualified candidates
                  who match your requirements. Our AI-powered platform helps you
                  find the right talent quickly.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup?role=recruiter">
                    <Button
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Plus className="mr-2 h-5 w-5" />
                      Post Your First Job Free
                    </Button>
                  </Link>
                  <Link to="/for-recruiters">
                    <Button size="lg" variant="outline">
                      Learn More About Hiring
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                Ready to Find Your Perfect Job?
              </h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals who have found their dream
                careers through our platform.
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Start Your Job Search Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
</div>
</AppShell>
  );
}
