import {
  Edit,
  Share,
  Bookmark,
  BookmarkCheck,
  Users,
  Eye,
  Calendar,
  ExternalLink,
  ArrowLeft,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link , useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import AuthOverlay from "@/components/AuthOverlay";
import DeclarativeJobRenderer from "@/components/job-renderer/DeclarativeJobRenderer";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jobService } from "@/lib/services/job-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useJobPermissions } from "@/hooks/use-job-permissions";
import JobPipelineKanban from "@/components/recruit/JobPipelineKanban";
import JobPipelineReports from "@/components/recruit/JobPipelineReports";
import SourcingFeePanel from "@/components/recruit/SourcingFeePanel";
import { jobPipelineService } from "@/lib/services/job-pipeline-service";
import { useSEO, generateStructuredData } from "@/lib/seo";
import { SAMPLE_JOB } from "@/lib/sample-job";
import { DEFAULT_JOB_DESCRIPTOR, getJobTemplateById } from "@/types/job-template";

type UIJobRequirement = { skill: string; level: string; required: boolean };
type UIJobBenefit = { type: string; description: string };
type UIJobCompany = {
  name: string;
  logo?: string;
  description?: string;
  industry?: string;
  size?: string;
  website?: string;
};
type UIJobLocation = { city?: string; state?: string; remote: boolean };
type UIJobData = {
  title: string;
  description: string;
  company: UIJobCompany;
  location: UIJobLocation;
  videoUrl?: string;
  contactEmail?: string;
  applicationDeadline?: string;
  responsibilities: string[];
  requirements: UIJobRequirement[];
  qualifications: string[];
  benefits: UIJobBenefit[];
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
};
type UIJob = {
  id: string;
  status: "active" | "paused" | "closed" | "draft";
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  views: number;
  applications: number;
  userId?: string;
  data: UIJobData;
};

function mapApiJobToUI(apiJob: any): UIJob {
  // If server returns envelope { success, data }, unwrap
  const j = apiJob?.data && apiJob.success !== undefined ? apiJob.data : apiJob;
  // Some jobs store serialized JSON in jobSerialized
  let parsed: any = {};
  try {
    if (
      typeof j.jobSerialized === "string" &&
      j.jobSerialized.trim().length > 0
    ) {
      parsed = JSON.parse(j.jobSerialized);
    }
  } catch {
    parsed = {};
  }
  return {
    id: (j.id || j.Id || "").toString(),
    status: ((j.status || j.Status) as UIJob["status"]) || "active",
    createdAt:
      j.createdAt ||
      j.creationDateTime ||
      j.postedDate ||
      new Date().toISOString(),
    updatedAt:
      j.updatedAt ||
      j.updateDateTime ||
      j.creationDateTime ||
      new Date().toISOString(),
    expiresAt: j.expiryDate || j.expirationDate,
    views: j.viewCount ?? 0,
    applications: j.applicationCount ?? 0,
    userId: j.createdBy || j.userId,
    data: {
      title: j.title || parsed.title || "",
      description: j.description || parsed.description || "",
      company: {
        name:
          j.company?.name || j.company || parsed.company || "Unknown Company",
        logo: j.companyLogo || j.company?.logoUrl || "",
        website: j.companyWebsite,
        description: j.companyDescription,
        industry:
          (Array.isArray(j.industry) ? j.industry[0] : j.industry) || undefined,
        size: j.size,
      },
      location: {
        remote: j.isRemote ?? false,
        city: j.city || j.address?.city || undefined,
        state: j.state || j.address?.stateProvince || undefined,
      },
      responsibilities: Array.isArray(j.responsibilities)
        ? j.responsibilities
        : Array.isArray(parsed.responsibilities)
          ? parsed.responsibilities
          : [],
      requirements: Array.isArray(j.requirements)
        ? j.requirements.map((r: string) => ({
            skill: r,
            level: "Intermediate",
            required: true,
          }))
        : [],
      qualifications: Array.isArray(j.qualifications) ? j.qualifications : [],
      benefits: Array.isArray(j.benefits)
        ? j.benefits.map((b: any) => ({
            type: b.type || "Benefit",
            description: b.description || "",
          }))
        : [],
      employmentType:
        (Array.isArray(j.employmentType)
          ? j.employmentType[0]
          : j.employmentType) || undefined,
      experienceLevel: j.experienceLevel,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      videoUrl: j.videoUrl,
      contactEmail: j.contactEmail,
      applicationDeadline: j.applicationDeadline,
    },
  };
}

export default function JobDetail() {
  const { t } = useTranslation();
  const { id: slug } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { format: formatTz } = useUserTimezone();
  const dateOnly: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [job, setJob] = useState<UIJob | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isTracked, setIsTracked] = useState<boolean>(false);
  const [pipelineCount, setPipelineCount] = useState<number>(0);

  const isSample = slug === "sample";

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (!slug) return;

      // Sample mode — /jobs/sample renders the showcase job with whichever
      // preset is requested via ?template=<id>. Skips API calls so anonymous
      // users can browse templates from the marketing gallery.
      if (isSample) {
        setJob(SAMPLE_JOB as unknown as UIJob);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Determine if the route param is a UUID or a slug
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

        let apiJob: any;
        if (isUUID) {
          // Load by ID for UUIDs
          apiJob = await jobService.getJobById(slug);
        } else {
          // Try slug first, then fallback to ID just in case
          try {
            apiJob = await jobService.getJobBySlug(slug);
          } catch (slugErr) {
            apiJob = await jobService.getJobById(slug);
          }
        }

        if (!isMounted) return;
        setJob(mapApiJobToUI(apiJob));
      } catch (e) {
        if (!isMounted) return;
        setError(t("errors.loadJobFailed"));
        setJob(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [slug, isSample]);

  // Template override from ?template=<id>. Falls back to the job's saved
  // templateId, then to the hired.video default descriptor.
  const templateQueryId = searchParams.get("template");

  // SEO: compute and apply at top-level to respect Rules of Hooks
  const jobSeoTitle = job
    ? `${job.data.title} at ${job.data.company.name} — hired.video`
    : undefined;
  const jobSeoDescription = job
    ? `${job.data.title} at ${job.data.company.name}${job.data.location?.remote ? " (Remote)" : job.data.location?.city ? ` in ${job.data.location.city}, ${job.data.location.state}` : ""}. ${job.data.description?.slice(0, 150)}`
    : undefined;
  const jobStructuredData = job
    ? generateStructuredData.jobPosting({
        id: job.id,
        title: job.data.title,
        description: job.data.description,
        postedDate: job.createdAt,
        validThrough: (job as any).data?.expiresAt || (job as any).expiresAt,
        employmentType: job.data.employmentType,
        companyName: job.data.company.name,
        companyLogoUrl: (job.data.company as any).logo || (job.data.company as any).logoUrl,
        companyWebsite: (job.data.company as any).website,
        isRemote: !!job.data.location?.remote,
        city: job.data.location?.city,
        state: job.data.location?.state,
        country: (job.data.location as any)?.country,
        salaryMin: job.data.salaryMin,
        salaryMax: job.data.salaryMax,
        salaryCurrency: (job.data as any).salaryCurrency || "USD",
        skills: (job.data as any).skills || (job.data as any).skillsRequired,
      })
    : undefined;

  useSEO(location.pathname, {
    title: jobSeoTitle,
    description: jobSeoDescription,
    ogTitle: jobSeoTitle,
    ogDescription: jobSeoDescription,
    structuredData: jobStructuredData,
  });

  const isOwner = user && job && job.userId === user.id;
  const permissions = useJobPermissions(job);

  // Pipeline tabs (Candidates + Reports) only surface for users who can
  // manage the job. Recruiters / employers / owners qualify; job seekers
  // and anonymous viewers see only the Overview tab so the structure stays
  // consistent across roles.
  const isRecruiterOrEmployer =
    user?.role === USER_ROLES.RECRUITER || user?.role === USER_ROLES.EMPLOYER;
  const canManagePipeline = Boolean(isOwner || isRecruiterOrEmployer);

  const sectionParam = searchParams.get("section");
  const section: "overview" | "candidates" | "reports" =
    canManagePipeline && (sectionParam === "candidates" || sectionParam === "reports")
      ? sectionParam
      : "overview";

  const handleSectionChange = (next: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("section", next);
    navigate({ search: sp.toString() }, { replace: true });
  };

  // Pre-fetch the pipeline count so the Candidates tab badge is accurate
  // before the user clicks into it. Fails silently for non-managers.
  useEffect(() => {
    if (!job?.id || !canManagePipeline) return;
    let cancelled = false;
    jobPipelineService
      .list(job.id)
      .then((snap) => {
        if (!cancelled) setPipelineCount(snap.total);
      })
      .catch(() => {
        // Permission denied or job not yet wired — leave count at 0.
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, canManagePipeline]);

  const handleTrackJob = () => {
    if (!isAuthenticated) return;
    setIsTracked((prev) => !prev);
  };

  if (loading) {
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
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <h1 className="text-2xl font-bold">{t("status.loadingJob")}</h1>
                  <CardDescription>{t("messages.pleaseWait")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-40 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  if (!job) {
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
              <h1 className="text-2xl font-bold mb-4">{t("headings.jobNotFound")}</h1>
              <p className="text-muted-foreground mb-6">
                {t("messages.jobNotFoundDesc")}
              </p>
              <Button asChild>
                <Link to="/jobs">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("actions.backToJobs")}
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
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      case "draft":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

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
            <AuthOverlay contentType="job" title={job?.data.title} />
          )}
          <div className="max-w-6xl mx-auto p-6">
            {/* Back Button */}
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate("/jobs")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("actions.backToJobs")}
              </Button>
            </div>

            {/* Per-job sub-section tabs — Overview is everyone; Candidates +
                Reports are gated to recruiters / employers / job owners. */}
            <Tabs value={section} onValueChange={handleSectionChange} className="mb-4">
              <TabsList className="inline-flex gap-1">
                <TabsTrigger value="overview" className="text-sm px-4">
                  {t("tabs.overview")}
                </TabsTrigger>
                {canManagePipeline && (
                  <>
                    <TabsTrigger value="candidates" className="text-sm px-4">
                      {t("tabs.candidates")}
                      <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs font-normal">
                        {pipelineCount}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="text-sm px-4">
                      {t("tabs.reports")}
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </Tabs>

            {section === "candidates" && canManagePipeline ? (
              <JobPipelineKanban jobId={job.id} onCountChange={setPipelineCount} />
            ) : section === "reports" && canManagePipeline ? (
              <JobPipelineReports jobId={job.id} />
            ) : (
              <>
            {/* Owner / viewer toolbar — sits above the declarative renderer.
                The header + all content sections are now produced by
                DeclarativeJobRenderer, themed via a JobTemplateDescriptor. */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                {isOwner && (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      {job.views} views
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {job.applications} applications
                    </span>
                  </>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Posted{" "}
                  {job.createdAt && !isNaN(new Date(job.createdAt).getTime())
                    ? formatTz(job.createdAt, dateOnly)
                    : "Unknown date"}
                </span>
                {job.expiresAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Expires{" "}
                    {!isNaN(new Date(job.expiresAt).getTime())
                      ? formatTz(job.expiresAt, dateOnly)
                      : "Unknown date"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {permissions.canEdit ? (
                  <Button asChild>
                    <Link to={`/jobs/edit/${job.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Job
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleTrackJob}>
                    {isTracked ? (
                      <>
                        <BookmarkCheck className="h-4 w-4 mr-2" />
                        Tracked
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-4 w-4 mr-2" />
                        Track
                      </>
                    )}
                  </Button>
                )}
                <Button variant="outline" size="icon">
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
                      entityType="job"
                      entityId={job.id}
                      entityLabel={job.data.title}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {isOwner && (
              <div className="mb-4">
                <SourcingFeePanel jobId={job.id} />
              </div>
            )}

            <DeclarativeJobRenderer
              job={{
                id: job.id,
                data: {
                  title: job.data.title,
                  description: job.data.description,
                  company: job.data.company,
                  location: job.data.location,
                  videoUrl: job.data.videoUrl,
                  contactEmail: job.data.contactEmail,
                  applicationDeadline: job.data.applicationDeadline,
                  applyUrl: (job.data as any).applyUrl,
                  responsibilities: job.data.responsibilities,
                  requirements: job.data.requirements,
                  qualifications: job.data.qualifications,
                  skills: (job.data as any).skills || (job.data as any).skillsRequired,
                  benefits: job.data.benefits,
                  employmentType: job.data.employmentType,
                  experienceLevel: job.data.experienceLevel,
                  salaryMin: job.data.salaryMin,
                  salaryMax: job.data.salaryMax,
                  salaryCurrency: (job.data as any).salaryCurrency,
                },
              }}
              descriptor={
                getJobTemplateById(templateQueryId) ??
                getJobTemplateById((job as any).templateId) ??
                DEFAULT_JOB_DESCRIPTOR
              }
              embedded
              heroActionSlot={
                permissions.canEdit ? (
                  <Button asChild size="lg" className="bg-white text-black hover:bg-white/90">
                    <Link to={`/jobs/edit/${job.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Job
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="bg-white text-black hover:bg-white/90"
                    disabled={!isAuthenticated}
                    asChild={Boolean((job.data as any).applyUrl)}
                  >
                    {(job.data as any).applyUrl ? (
                      <a
                        href={(job.data as any).applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Apply now
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    ) : (
                      <>
                        Apply now
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                )
              }
            />
              </>
            )}
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}
