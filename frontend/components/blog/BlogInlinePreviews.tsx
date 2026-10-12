// Inline previews a blog post can embed above its body: sample people
// cards, public video resumes (/v/<id>) and scaled resume-template renders.
// Each block self-gates on an empty list so BlogPost mounts them all.

import { Link } from "react-router-dom";
import { publicProfilePath, publicVideoPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import PeopleCard from "@/components/PeopleCard";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { getSamplePersonById } from "@/lib/sample-people";
import { getTemplateById } from "@/types/resume-template";
import { cn } from "@/lib/utils";

const GRID = "my-8 grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-4";

export function BlogPeoplePreviews({ ids }: { ids?: string[] }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className={cn("my-8 grid gap-4", ids.length > 1 && "sm:grid-cols-2")}>
      {ids.map((id) => {
        const person = getSamplePersonById(id);
        if (!person) return null;
        return (
          <PeopleCard
            key={id}
            person={person}
            layout="vertical"
            onView={() => {
              window.location.href = publicProfilePath(person.slug);
            }}
          />
        );
      })}
    </div>
  );
}

export function BlogVideoPreviews({ ids }: { ids?: string[] }) {
  const { t } = useTranslation();
  if (!ids || ids.length === 0) return null;
  return (
    <div className={cn("my-8 grid gap-4", ids.length > 1 && "sm:grid-cols-2")}>
      {ids.map((id) => (
        <div key={id} className="aspect-video overflow-hidden rounded-2xl border border-border bg-ink">
          <iframe
            src={publicVideoPath(id)}
            title={t("blog.post.videoTitle", { id })}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ))}
    </div>
  );
}

/** Scaled-down render of each template on the shared SAMPLE_RESUME. */
export function BlogTemplatePreviews({ ids }: { ids?: string[] }) {
  const { t } = useTranslation();
  if (!ids || ids.length === 0) return null;
  return (
    <div className={GRID}>
      {ids.map((id) => {
        const descriptor = getTemplateById(id);
        if (!descriptor) return null;
        return (
          <Link
            key={id}
            to={`/marketplace/templates/${id}`}
            className="group flex flex-col gap-3 rounded-[18px] border border-border bg-card p-3.5 transition-colors hover:border-primary/50"
            aria-label={t("templates.card.previewAria", { name: descriptor.name })}
          >
            <div className="relative h-72 w-full overflow-hidden rounded-xl bg-muted">
              <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
                <div
                  className="origin-top"
                  style={{ transform: "scale(0.32)", transformOrigin: "top center", width: "900px" }}
                >
                  <DeclarativeResumeRenderer resume={SAMPLE_RESUME} descriptor={descriptor} embedded />
                </div>
              </div>
            </div>
            <div>
              <div className="text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary">
                {descriptor.name}
              </div>
              {descriptor.industry && (
                <div className="mt-0.5 text-[13px] text-muted-foreground">{descriptor.industry}</div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
