/**
 * JobInlineBody — renders a user-posted job inside a `linked-content`
 * canvas widget via the SAME `<DeclarativeJobRenderer/>` the
 * `/jobs/:id` detail page mounts. Mirrors `ResumeInlineBody`'s pattern
 * so a job dropped into the studio looks like a faithful thumbnail of
 * the job's actual posting page (template-themed, company branding,
 * requirements list, etc.) rather than a hand-rolled summary card.
 *
 * Mapping + descriptor resolution match `JobDetail.tsx` exactly via
 * shared `mapApiJobToUI` + `getJobTemplateById` so every "render a
 * job" surface produces the same visual output.
 */
import { useEffect, useState } from "react";
import DeclarativeJobRenderer from "@/components/job-renderer/DeclarativeJobRenderer";
import {
  DEFAULT_JOB_DESCRIPTOR,
  getJobTemplateById,
  type JobTemplateDescriptor,
} from "@/types/job-template";
import { jobService } from "@/lib/services/job-service";
import { mapApiJobToUI, type UIJob } from "@/lib/jobs/api-job-mapper";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface JobInlineBodyProps {
  id: string;
}

export default function JobInlineBody({ id }: JobInlineBodyProps) {
  const [job, setJob] = useState<UIJob | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    jobService
      .getJobById(id)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setLoadState("error");
          return;
        }
        setJob(mapApiJobToUI(raw));
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading job…" />;
  if (loadState === "error" || !job) {
    return <InlineBodyMessage label="Couldn't load this job." />;
  }

  const descriptor: JobTemplateDescriptor =
    getJobTemplateById((job as any).templateId) ?? DEFAULT_JOB_DESCRIPTOR;

  return (
    <ScaledTemplateFrame>
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
            responsibilities: job.data.responsibilities,
            requirements: job.data.requirements,
            qualifications: job.data.qualifications,
            benefits: job.data.benefits,
            employmentType: job.data.employmentType,
            experienceLevel: job.data.experienceLevel,
            salaryMin: job.data.salaryMin,
            salaryMax: job.data.salaryMax,
          },
        }}
        descriptor={descriptor}
        embedded
        // Owner-facing studio surface — suppress the renderer's
        // default Apply Now button (you don't apply to your own job).
        heroActionSlot={<></>}
      />
    </ScaledTemplateFrame>
  );
}
