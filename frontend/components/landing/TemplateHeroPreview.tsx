/**
 * TemplateHeroPreview — the /templates/:slug hero (#922): the template's own
 * seeded canvas instead of an icon in a box. Timeline kinds (video, podcast,
 * voice…) get the press-play preview the marketplace uses, lazy-loaded so the
 * canvas runtime stays out of the landing chunk; until it loads (and for
 * static kinds) the template's thumbnail is the hero. Same seed the studio
 * opens on "Use", so the hero shows exactly what the visitor will edit.
 */
import { Suspense, lazy } from "react";
import { mediaKindUsesTimelineExport } from "@shared/media-kinds";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import type { TemplateDef } from "@/lib/studio/templates/catalog";

const BuiltinPlayer = lazy(() =>
  import("@/components/templates/TemplatePlayer").then((m) => ({ default: m.BuiltinPlayer })),
);

export function TemplateHeroPreview({ template }: { template: TemplateDef }) {
  const still = <TemplateThumb template={template} className="h-full w-full rounded-none" />;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-[24px] border border-border bg-muted">
      {mediaKindUsesTimelineExport(template.mediaKind) ? (
        <Suspense fallback={still}>
          <BuiltinPlayer def={template} name={template.label} />
        </Suspense>
      ) : (
        still
      )}
    </div>
  );
}
