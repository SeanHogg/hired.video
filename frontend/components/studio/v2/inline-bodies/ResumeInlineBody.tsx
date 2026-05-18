/**
 * ResumeInlineBody — renders a user's resume inside a `linked-content`
 * canvas widget using the SAME `<DeclarativeResumeRenderer/>` the
 * `/resumes/:id` page mounts. The widget therefore looks like a faithful
 * thumbnail of the actual resume in its chosen template (Modern Clean /
 * Bold Hero / Print Serif / etc.) rather than a hand-rolled summary card.
 *
 * Scaling: the resume template is authored against an 800px content
 * width. A ResizeObserver-driven scale wraps the renderer in a
 * `transform: scale(containerWidth / 800)` container so the thumbnail
 * fits any widget size at any canvas zoom level without per-template
 * tuning. `top-left` transform-origin keeps the resume anchored to the
 * widget's top edge so titles / headshots stay visible when the widget
 * is short.
 *
 * Per the DRY rule: descriptor selection mirrors `EmbeddedResume.tsx`
 * exactly — `meta.embeddedTemplate` (the explicit embed override) wins,
 * then `meta.template` (the resume's primary), then `DEFAULT_DESCRIPTOR`.
 * Changing how resumes pick a template still happens in one place
 * (`resume-template.ts`) and both surfaces inherit it.
 */
import { useEffect, useRef, useState } from "react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import {
  DEFAULT_DESCRIPTOR,
  getTemplateById,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";
import { resumeService } from "@/lib/services/resume-service";
import type { Resume } from "@/types/resume";

/** Native authoring width for resume templates — matches the
 *  `max-w-6xl` (~1152px) the `/resumes/:id` page mounts at, dropped to
 *  800 so dense templates still feel legible when scaled into a
 *  thumbnail-sized canvas widget. */
const TEMPLATE_NATIVE_WIDTH = 800;

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

  if (loadState === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
        Loading resume…
      </div>
    );
  }

  if (loadState === "error" || !resume) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
        Couldn't load this resume.
      </div>
    );
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

/** Measure container + inner template via ResizeObserver, scale the
 *  fixed-width inner via `transform: scale(...)` so the template fills
 *  100% of the bounded widget — cropping vertically when the natural
 *  template aspect-ratio is taller than the widget, cropping
 *  horizontally when shorter. Single source of truth for "fit any
 *  DeclarativeXRenderer into a fractional canvas widget"; future job /
 *  profile / company inline bodies reuse this shell.
 *
 *  Why fill-with-crop (not fit-with-letterbox): resume templates are
 *  long documents that almost always exceed widget height once scaled
 *  to fit width — letterboxing leaves a band of whitespace below the
 *  visible portion, which is exactly the bug we're fixing. Crop hides
 *  the bottom of the template (the CTA pill links viewers to the full
 *  page) while keeping the visually identifiable header / opening
 *  sections flush to the widget edges. */
function ScaledTemplateFrame({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      // CSS transforms don't affect offsetHeight — so the inner div's
      // offsetHeight is the template's natural pixel height at the
      // authored 800px width, even after we've stamped the scale.
      const ih = inner.offsetHeight;
      if (cw <= 0 || ch <= 0 || ih <= 0) return;
      const widthScale = cw / TEMPLATE_NATIVE_WIDTH;
      const heightScale = ch / ih;
      // `max` so the smaller dimension dictates the scale → the
      // template always fills both width and height, with the
      // remaining dimension cropped via the container's `overflow:
      // hidden`. No letterbox whitespace.
      setScale(Math.max(widthScale, heightScale));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-white">
      <div
        ref={innerRef}
        style={{
          width: TEMPLATE_NATIVE_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
