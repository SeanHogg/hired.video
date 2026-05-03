// Kind-aware preview body. Owns the per-kind branching for what to render
// (resume document vs. video / thumbnail) so every other surface — cards,
// route page, sheet drawer — can pass a TemplateMeta and never touch the
// origin discriminator itself.

import { FileVideo, Sparkles } from "lucide-react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
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

  // No thumbnail — fall back to an icon card so cards never render empty.
  // Studio built-ins use the catalog icon; creator templates without a
  // thumbnail get a generic video glyph.
  if (meta.origin.kind === "studio-builtin") {
    const Icon = meta.origin.def.icon;
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary/5 to-primary/10 text-primary">
        <Icon className="w-12 h-12" />
        <span className="text-sm font-medium">{meta.name}</span>
      </div>
    );
  }

  const FallbackIcon = meta.kind === "studio-creator" ? FileVideo : Sparkles;
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
      <FallbackIcon className="w-10 h-10" />
    </div>
  );
}
