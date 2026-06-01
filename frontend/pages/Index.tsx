import {
  Briefcase,
  Play,
  ArrowRight,
  Brain,
  Users,
  FileText,
} from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import FeaturedTools from "@/components/FeaturedTools";
import LatestGuides from "@/components/LatestGuides";
import UnifiedSearch from "@/components/UnifiedSearch";
import { AIInputBox } from "@/components/AIInputBox";
import TemplateGallery from "@/components/resume-renderer/TemplateGallery";
import JobTemplateGallery from "@/components/job-renderer/JobTemplateGallery";
import VideoCard from "@/components/VideoCard";
import HeroVideoSpotlight from "@/components/HeroVideoSpotlight";
import { AppShell } from "@/components/AppShell";
import { studioService, type PublicVideo } from "@/lib/services/studio-service";
import { aiCoachHref } from "@/lib/ai-context";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  useSEO(location.pathname);
  useDefaultBreadcrumbs();
  const [publicVideos, setPublicVideos] = useState<PublicVideo[]>([]);

  // Hero shows only the SA-curated featured set; empty → skeleton.
  React.useEffect(() => {
    studioService
      .getFeaturedVideos()
      .then((res) => setPublicVideos(res.data ?? []))
      .catch(() => {});
  }, []);

  return (
    <AppShell bgClassName="bg-background">
<h1 className="sr-only">{t("marketing.index.srHeading")}</h1>

        {/* AI CHRO Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 pt-8 pb-10 px-4 sm:px-6 lg:px-8 border-b border-border">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[400px] w-full max-w-[800px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-3 min-w-0 text-center lg:text-left">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
                {t("marketing.index.heroTitle1")} <span className="text-primary">{t("marketing.index.heroTitle2")}</span>
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-xl mx-auto lg:mx-0">
                {t("marketing.index.heroSubtitle")}
              </p>

              <AIInputBox
                onSubmit={(q) =>
                  navigate(aiCoachHref(q))
                }
              />

              <div className="flex flex-wrap gap-2 justify-center lg:justify-start mt-5">
                {[
                  {
                    icon: FileText,
                    label: t("marketing.index.chroChip.optimize"),
                    q: t("marketing.index.chroChipQ.optimize"),
                  },
                  {
                    icon: Briefcase,
                    label: t("marketing.index.chroChip.writeJd"),
                    q: t("marketing.index.chroChipQ.writeJd"),
                  },
                  {
                    icon: Users,
                    label: t("marketing.index.chroChip.sourceCandidates"),
                    q: t("marketing.index.chroChipQ.sourceCandidates"),
                  },
                  {
                    icon: Brain,
                    label: t("marketing.index.chroChip.interview"),
                    q: t("marketing.index.chroChipQ.interview"),
                  },
                ].map(({ icon: Icon, label, q }) => (
                  <button
                    key={label}
                    onClick={() =>
                      navigate(aiCoachHref(q))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-muted hover:border-primary/40 transition-colors px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    {label}
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 min-w-0">
              <HeroVideoSpotlight videos={publicVideos} />
            </div>
          </div>
        </section>

        {/* Unified search control + results grid */}
        <UnifiedSearch stickySearch />

        {/* Resume Templates Section */}
        <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
          <div>
            <TemplateGallery />
          </div>
        </section>

        {/* Job Posting Templates Section */}
        <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
          <div>
            <JobTemplateGallery />
          </div>
        </section>

        {/* Public Video Resumes Section */}
        {publicVideos.length > 0 && (
          <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Play className="w-5 h-5 text-primary" />
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                  {t("labels.videoResumes")}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {publicVideos.map((v) => (
                  <VideoCard
                    key={v.id}
                    id={v.id}
                    title={v.title}
                    description={
                      v.description ?? t("marketing.index.ownerVideoResume", { name: v.ownerName })
                    }
                    thumbnail={v.thumbnailUrl ?? ""}
                    duration=""
                    views={0}
                    type="resume"
                    profession={v.ownerName}
                    company="hired.video"
                    createdAt={v.createdAt}
                    video={v}
                    onView={() => navigate(`/v/${v.id}`)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        <FeaturedTools />

        <LatestGuides />
</AppShell>
  );
}
