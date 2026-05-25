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
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import AuthOverlay from "@/components/AuthOverlay";
import DeclarativeJobRenderer from "@/components/job-renderer/DeclarativeJobRenderer";
import JobScoreBadges from "@/components/tools/JobScoreBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { jobService } from "@/lib/services/job-service";
import { isUuid } from "@shared/value-types";
import { useAuth } from "@/lib/auth";
import { useJobPermissions } from "@/hooks/use-job-permissions";
import { useArtifactViewTracking } from "@/hooks/use-artifact-view-tracking";
import ArtifactDetailsSheet from "@/components/shared/ArtifactDetailsSheet";
import JobPipelineKanban from "@/components/recruit/JobPipelineKanban";
import JobPipelineReports from "@/components/recruit/JobPipelineReports";
import SourcingFeePanel from "@/components/recruit/SourcingFeePanel";
import { TimeToHireCard } from "@/components/jobs/TimeToHireCard";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import EntityHubTabStrip from "@/components/EntityHubTabStrip";
import { Briefcase } from "lucide-react";
import { jobPipelineService } from "@/lib/services/job-pipeline-service";
import { useUgcSeo } from "@/lib/seo-ugc";
import { SAMPLE_JOB } from "@/lib/sample-job";
import { DEFAULT_JOB_DESCRIPTOR, getJobTemplateById } from "@/types/job-template";
import { mapApiJobToUI, type UIJob } from "@/lib/jobs/api-job-mapper";

export default function JobDetail() {
  const { t } = useTranslation();
  const { id: slug } = useParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const { format: formatTz } = useUserTimezone();
  const dateOnly: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
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

        let apiJob: any;
        if (isUuid(slug)) {
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

  // SEO — single adapter call. Builder lives in lib/seo-ugc.ts ("job"
  // kind) and emits title/description, company-logo og:image, keywords
  // from skills_required, and the JobPosting JSON-LD.
  useUgcSeo("job", job);

  const isOwner = user && job && job.userId === user.id;
  const permissions = useJobPermissions(job);
  useArtifactViewTracking({
    artifactKind: "job",
    artifactId: job?.id,
    ownerUserId: (job as any)?.userId ?? null,
  });

  // Pipeline tabs (Candidates + Reports) gate on the same single source
  // of truth as Edit / Delete (`useJobPermissions`), which mirrors the
  // backend's `requireJobOwner` rule via the DTO's `viewerCanManage`
  // flag. The panels self-gate on the same fact so the tab strip and
  // the body can't disagree.
  const canManagePipeline = permissions.canManagePipeline;

  const sectionParam = searchParams.get("section");
  const section: "overview" | "candidates" | "reports" =
    canManagePipeline && (sectionParam === "candidates" || sectionParam === "reports")
      ? sectionParam
      : "overview";

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
      <AppShell bgClassName="bg-background">
<div className="p-6">
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
</AppShell>
  );
  }

  if (!job) {
    return (
      <AppShell bgClassName="bg-background">
<div className="p-6">
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
</AppShell>
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

  // Breadcrumb + leaf section tabs. Overview is the canonical leaf; the
  // recruiter-only Candidates / Reports panels become extra siblings on
  // the same strip. Falls back to "/jobs" parent for the breadcrumb.
  const jobTabs: PageHeaderTab[] = [
    { key: "jobs", label: "Jobs", icon: Briefcase, to: "/jobs" },
    { key: "overview", label: t("tabs.overview"), to: `/jobs/${job.id}` },
    ...(canManagePipeline
      ? [
          {
            key: "candidates",
            label: t("tabs.candidates"),
            to: `/jobs/${job.id}?section=candidates`,
            badge: pipelineCount,
          } satisfies PageHeaderTab,
          {
            key: "reports",
            label: t("tabs.reports"),
            to: `/jobs/${job.id}?section=reports`,
          } satisfies PageHeaderTab,
        ]
      : []),
  ];
  const activeJobTab = section === "candidates"
    ? "candidates"
    : section === "reports"
      ? "reports"
      : "overview";

  return (
    <AppShell bgClassName="bg-background">
      <div className={!isAuthenticated ? "relative" : undefined}>
          {!isAuthenticated && (
            <AuthOverlay contentType="job" title={job?.data.title} />
          )}
          <div className="max-w-6xl mx-auto p-4 md:p-6">
            {/* Hub-level tab strip — keeps the Jobs / Saved / Applications
                / Alerts / My Postings / Candidates context visible. */}
            {isAuthenticated && <EntityHubTabStrip entity="job" />}
            <PageHeader tabs={jobTabs} activeTabKey={activeJobTab} />

            {section === "candidates" ? (
              <JobPipelineKanban
                jobId={job.id}
                jobOwner={{ userId: job.userId, viewerCanManage: job.viewerCanManage }}
                onCountChange={setPipelineCount}
              />
            ) : section === "reports" ? (
              <JobPipelineReports
                jobId={job.id}
                jobOwner={{ userId: job.userId, viewerCanManage: job.viewerCanManage }}
              />
            ) : (
              <>
            {/* Owner / viewer toolbar — sits above the declarative renderer.
                The header + all content sections are now produced by
                DeclarativeJobRenderer, themed via a JobTemplateDescriptor. */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                <JobScoreBadges job={job} />
                <ArtifactDetailsSheet
                  permission={{
                    kind: "job",
                    entity: { id: job.id, userId: job.userId, viewerCanManage: job.viewerCanManage },
                  }}
                  title={job.data?.title ?? "Job details"}
                  chips={
                    <Badge variant="secondary">{job.status}</Badge>
                  }
                  activity={{
                    viewCount: job.views,
                    createdAt: job.createdAt,
                    updatedAt: job.updatedAt,
                    extra: [
                      { label: "Applications", value: <span className="tabular-nums">{job.applications ?? 0}</span> },
                    ],
                  }}
                />
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

            {/* Time-to-hire metric. Self-gates on manager-only access via
                the backend's 403 — no `if (isOwner)` wrapping needed at
                the call site per the platform's "shared components decide
                their own visibility" rule. */}
            <div className="mb-4">
              <TimeToHireCard jobId={job.id} />
            </div>

            <DeclarativeJobRenderer
              job={{
                id: job.id,
                data: {
                  title: job.data.title,
                  description: job.data.description,
                  company: job.data.company,
                  location: job.data.location,
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
                // Owners / editors already have the Edit Job button up in the
                // toolbar — passing an empty fragment here suppresses the
                // hero's default Apply Now (you can't apply to your own job).
                permissions.canEdit ? (
                  <></>
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
</div>
</AppShell>
  );
}
