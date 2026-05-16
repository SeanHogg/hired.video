// Kind-aware preview body. Owns the per-kind branching for what to render
// (resume document vs. video / thumbnail) so every other surface — cards,
// route page, sheet drawer — can pass a TemplateMeta and never touch the
// origin discriminator itself.

import { FileVideo } from "lucide-react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
  /** Optional resume override. Resume previews can render against the user's
   *  own content when callers want — the route page already does this. */
  resume?: typeof SAMPLE_RESUME;
  /** Compact mode for cards; renders a scaled, non-interactive thumbnail. */
  compact?: boolean;
}

export default function TemplatePreview({ meta, resume, compact = false }: Props) {
  if (meta.origin.kind === "resume") {
    return (
      <DeclarativeResumeRenderer
        resume={resume ?? SAMPLE_RESUME}
        descriptor={meta.origin.descriptor}
        embedded={compact}
      />
    );
  }

  // Studio built-ins always render through TemplateThumb so the per-template
  // PowerPoint-style mockup used on /studio matches what shows up on cards,
  // /marketplace/templates/:slug, and the homepage strip — single source of
  // truth for "what does this template look like". The thumb fills its
  // parent (which supplies the aspect / size constraint); aspect-video is
  // overridden by explicit h-full + w-full.
  if (meta.origin.kind === "studio-builtin") {
    return (
      <TemplateThumb
        template={meta.origin.def}
        className="h-full w-full rounded-none"
      />
    );
  }

  if (meta.origin.kind === "studio-creator" && meta.previewVideoUrl) {
    return (
      <video
        src={meta.previewVideoUrl}
        poster={meta.thumbnailUrl}
        controls={!compact}
        className="w-full h-full object-cover bg-black"
      />
    );
  }

  if (meta.thumbnailUrl) {
    return (
      <img
        src={meta.thumbnailUrl}
        alt={meta.name}
        className="w-full h-full object-cover"
        crossOrigin="anonymous"
      />
    );
  }

  // Creator templates without a thumbnail get a generic video glyph so
  // cards never render empty.
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
      <FileVideo className="w-10 h-10" />
    </div>
  );
}
