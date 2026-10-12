// Signed-out view of /jobs: hero, headline figures, a featured-jobs preview
// (real public listings), why-it-works cards, optional employer CTA and the
// closing ink band. Composed from the shared marketing primitives.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Building2, Plus, Target, Video, Wand2, Zap } from "lucide-react";
import JobCard from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { FeatureCardGrid } from "@/components/app-marketing/FeatureCardGrid";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";
import type { JobSummary } from "@/lib/services/job-service";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";

/** Public listing → the JobCard metadata shape (fields the summary lacks default). */
function toCardJob(job: JobSummary) {
  // The public summary carries a few optional extras the typed shape omits.
  const extra = job as JobSummary & Partial<Record<string, unknown>>;
  const str = (k: string) => (typeof extra[k] === "string" ? (extra[k] as string) : "");
  const num = (k: string) => (typeof extra[k] === "number" ? (extra[k] as number) : 0);
  return {
    id: job.id,
    slug: str("slug"),
    title: job.title,
    company: job.company,
    companyId: str("companyId"),
    location: job.location,
    description: str("description"),
    salary:
      job.salaryMin && job.salaryMax
        ? `$${(job.salaryMin / 1000).toFixed(0)}k - $${(job.salaryMax / 1000).toFixed(0)}k`
        : undefined,
    employmentType: job.employmentType,
    experienceLevel: str("experienceLevel") || "entry",
    postedDate: job.postedDate || "",
    isRemote: job.isRemote || false,
    status: "active" as const,
    privacy: "public" as const,
    views: num("views"),
    applications: num("applications"),
    createdAt: str("createdAt"),
    updatedAt: str("updatedAt"),
    summary: str("summary"),
    userId: str("userId"),
  };
}

export default function JobsMarketing({ jobs }: { jobs: JobSummary[] }) {
  const { t } = useTranslation();

  // Hiring-side framing (post a job, hiring-manager videos, direct lines to
  // hiring managers) follows the persona switch; job-seeker copy otherwise.
  const whyItems = HIRING_PERSONAS_ENABLED
    ? [
        { key: "match", icon: Target, title: t("headings.aiPoweredMatching"), description: t("messages.jobs.aiMatchingDesc") },
        { key: "video", icon: Video, title: t("headings.videoJobDescriptions"), description: t("messages.jobs.videoDescriptionsDesc") },
        { key: "direct", icon: Zap, title: t("headings.directConnections"), description: t("messages.jobs.directConnectionsDesc") },
      ]
    : [
        { key: "match", icon: Target, title: t("headings.aiPoweredMatching"), description: t("messages.jobs.aiMatchingDesc") },
        { key: "tailor", icon: Wand2, title: t("jobsMarketing.seeker.tailorTitle"), description: t("jobsMarketing.seeker.tailorDesc") },
        { key: "video", icon: Video, title: t("jobsMarketing.seeker.videoTitle"), description: t("jobsMarketing.seeker.videoDesc") },
      ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <SeoHero
          eyebrow={t("labels.smartJobs")}
          title={t("headings.discoverPerfectCareerMatch")}
          lede={t(HIRING_PERSONAS_ENABLED ? "messages.jobs.heroSubtitle" : "jobsMarketing.seeker.lede")}
          primary={{ to: "/signup", label: t("actions.findYourDreamJob") }}
          // Anon adoption (#2212): start a job posting in the studio; Save /
          // Publish gate for sign-up in place. Job-seeker focus: build a resume.
          secondary={
            HIRING_PERSONAS_ENABLED
              ? { to: studioNewEntityHref("job"), label: t("actions.postAJob") }
              : { to: NEW_KIT_PATH, label: t("landing.cta.buildMyResume") }
          }
        />

        <MarketingBand tone="card" labelledBy="jobs-featured-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="jobs-featured-title" title={t("headings.featuredOpportunities")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-6">
            {jobs.slice(0, 2).map((job) => (
              <JobCard key={job.id} job={toCardJob(job)} />
            ))}
          </div>
          <Link to="/signup" className="inline-flex min-h-[44px] items-center gap-2 self-start font-semibold text-primary hover:underline">
            {t("jobsMarketing.viewAllJobs")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </MarketingBand>

        <MarketingBand labelledBy="jobs-why-title" className="flex flex-col gap-10">
          <MarketingSectionIntro id="jobs-why-title" title={t("headings.whyChooseJobPlatform")} />
          <FeatureCardGrid items={whyItems} />
        </MarketingBand>

        {/* Employer CTA — hiring personas are switched off for the job-seeker focus */}
        {HIRING_PERSONAS_ENABLED && (
          <MarketingBand tone="card">
            <div className="flex flex-col items-start gap-4 rounded-[20px] border border-border bg-background p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
                <Building2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t("headings.jobs.hiringFindTalent")}</h2>
              <p className="max-w-2xl text-muted-foreground">{t("messages.jobs.employerCtaDesc")}</p>
              <Button asChild size="lg">
                <Link to={studioNewEntityHref("job")}>
                  <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
                  {t("actions.postFirstJobFree")}
                </Link>
              </Button>
            </div>
          </MarketingBand>
        )}

        <SeoFinalCta
          id="jobs"
          title={t("headings.jobs.readyToFindJob")}
          body={t("jobsMarketing.finalBody")}
          primary={{ to: "/signup", label: t("actions.startJobSearchToday") }}
        />
      </main>
    </AppShell>
  );
}
