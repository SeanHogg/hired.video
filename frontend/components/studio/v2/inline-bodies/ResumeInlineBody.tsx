/**
 * ResumeInlineBody — renders a user's resume inside a `linked-content`
 * canvas widget using the SAME `<DeclarativeResumeRenderer/>` the
 * `/resumes/:id` page mounts. The widget therefore looks like a faithful
 * thumbnail of the actual resume in its chosen template (Modern Clean /
 * Bold Hero / Print Serif / etc.) rather than a hand-rolled summary card.
 *
 * Scaling: the resume template is authored against an 800px content
 * width — `<ScaledTemplateFrame/>` is the shared shell that owns the
 * ResizeObserver + transform math.
 *
 * Per the DRY rule: descriptor selection mirrors `EmbeddedResume.tsx`
 * exactly — `meta.embeddedTemplate` (the explicit embed override) wins,
 * then `meta.template` (the resume's primary), then `DEFAULT_DESCRIPTOR`.
 * Changing how resumes pick a template still happens in one place
 * (`resume-template.ts`) and both surfaces inherit it.
 */
import { useEffect, useState } from "react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";
import { resumeService } from "@/lib/services/resume-service";
import type { Resume } from "@/types/resume";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface ResumeInlineBodyProps {
  id: string;
}

export default function ResumeInlineBody({ id }: ResumeInlineBodyProps) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    // `getResumeForEmbed` bypasses auth / privacy so a public resume
    // embeds even when the studio editor session can't authenticate
    // against the owner's account — falls back to the auth'd
    // `getResumeById` for unpublished drafts the owner is editing.
    resumeService
      .getResumeForEmbed(id)
      .catch(() => resumeService.getResumeById(id))
      .then((r) => {
        if (cancelled) return;
        if (!r) {
          setResume(null);
          setLoadState("error");
          return;
        }
        setResume(r);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setResume(null);
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading resume…" />;
  if (loadState === "error" || !resume) {
    return <InlineBodyMessage label="Couldn't load this resume." />;
  }

  const descriptor: ResumeTemplateDescriptor =
    getTemplateById(resume.content?.meta?.embeddedTemplate) ??
    getTemplateById(resume.content?.meta?.template) ??
    DEFAULT_DESCRIPTOR;

  return (
    <ScaledTemplateFrame>
      <DeclarativeResumeRenderer
        resume={resume}
        descriptor={descriptor}
        embedded
      />
    </ScaledTemplateFrame>
  );
}
