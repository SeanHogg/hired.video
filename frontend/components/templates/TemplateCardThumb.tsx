// The thumbnail every template card draws (browse grid, home gallery,
// related strip). Resume templates get a light "paper" sketch derived from
// the real descriptor (layout family, accent, serif) via thumb-spec; video
// kinds reuse the kind-aware TemplatePreview in a 16:9 frame.
// Decorative: callers wrap it in a labelled link/button.

import TemplatePreview from "@/components/templates/TemplatePreview";
import { cn } from "@/lib/utils";
import { thumbSpecFor, type ThumbSpec } from "@/lib/templates/thumb-spec";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
  className?: string;
}

export default function TemplateCardThumb({ meta, className }: Props) {
  if (meta.resumeDescriptor) {
    return <ResumeSketch spec={thumbSpecFor(meta.resumeDescriptor)} className={className} />;
  }
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none relative aspect-video w-full overflow-hidden rounded-xl bg-ink", className)}
    >
      <div className="absolute inset-0">
        <TemplatePreview meta={meta} compact />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resume paper sketch. The paper stays light in both themes, like the real
// document renderer (resumes print on white).
// ---------------------------------------------------------------------------

/** Grey body line at a given width. */
function Line({ w, tone = "bg-muted" }: { w: string; tone?: string }) {
  return <div className={cn("h-1 rounded-sm", tone)} style={{ width: w }} />;
}

function NameBar({ spec }: { spec: ThumbSpec }) {
  return (
    <div
      className={cn("w-[62%]", spec.serif ? "h-[9px] bg-ink" : cn("h-2 rounded-sm", spec.accentBg))}
    />
  );
}

function Rule({ spec }: { spec: ThumbSpec }) {
  return spec.serif ? (
    <div className="my-[3px] h-px w-full bg-ink" />
  ) : (
    <div className={cn("my-[3px] h-[3px] w-[26%] rounded-sm", spec.accentBg)} />
  );
}

function ResumeSketch({ spec, className }: { spec: ThumbSpec; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex aspect-[8.5/11] w-full flex-col overflow-hidden rounded-md bg-card ring-1 ring-inset ring-border",
        className,
      )}
    >
      {spec.layout === "hero" && <HeroSketch spec={spec} />}
      {spec.layout === "single" && <SingleSketch spec={spec} />}
      {spec.layout === "two" && <TwoSketch spec={spec} />}
      {spec.layout === "sidebar" && <SidebarSketch spec={spec} />}
      {spec.layout === "photo" && <PhotoSketch spec={spec} />}
    </div>
  );
}

function HeroSketch({ spec }: { spec: ThumbSpec }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 p-[9%]", spec.accentBg)}>
        <div className="aspect-square w-[22%] rounded-full bg-white/35 ring-2 ring-white" />
        <div className="flex flex-1 flex-col gap-[5px]">
          <div className="h-2 w-[70%] rounded-sm bg-card" />
          <div className="h-1 w-1/2 rounded-sm bg-white/70" />
          <div className="mt-1 h-3.5 w-[60%] rounded-[3px] bg-ink/45" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-[9%] pt-[9%]">
        <div className="flex h-1.5 gap-0.5">
          <div className={cn("flex-[2] rounded-sm opacity-45", spec.accentBg)} />
          <div className={cn("flex-[3] rounded-sm opacity-70", spec.accentBg)} />
          <div className={cn("flex-[4] rounded-sm", spec.accentBg)} />
        </div>
        <Rule spec={spec} />
        <Line w="92%" />
        <Line w="80%" />
        <Line w="86%" />
        <Rule spec={spec} />
        <Line w="74%" />
        <Line w="88%" />
      </div>
    </div>
  );
}

function SingleSketch({ spec }: { spec: ThumbSpec }) {
  return (
    <div className="flex h-full flex-col gap-1.5 px-[10%] py-[11%]">
      <NameBar spec={spec} />
      <Line w="46%" tone="bg-slate-300" />
      <Rule spec={spec} />
      <Line w="94%" />
      <Line w="84%" />
      <Line w="90%" />
      <Rule spec={spec} />
      <Line w="78%" />
      <Line w="88%" />
      <Line w="70%" />
      <Rule spec={spec} />
      <Line w="60%" />
    </div>
  );
}

function TwoSketch({ spec }: { spec: ThumbSpec }) {
  return (
    <div className="flex h-full flex-col gap-2 px-[9%] py-[10%]">
      <NameBar spec={spec} />
      <Rule spec={spec} />
      <div className="flex flex-1 gap-2">
        <div className="flex flex-[2] flex-col gap-1.5">
          <Line w="94%" />
          <Line w="82%" />
          <Line w="88%" />
          <Rule spec={spec} />
          <Line w="76%" />
          <Line w="90%" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("h-[7px] w-[90%] rounded-[3px] opacity-25", spec.accentBg)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarSketch({ spec }: { spec: ThumbSpec }) {
  return (
    <div className="flex h-full">
      <div className={cn("flex w-[34%] flex-col items-center gap-1.5 px-[7%] py-[12%]", spec.accentBg)}>
        <div className="aspect-square w-[60%] rounded-full bg-white/25" />
        <div className="h-1 w-[80%] rounded-sm bg-white/60" />
        <div className="h-1 w-[64%] rounded-sm bg-white/45" />
        <div className="h-1 w-[72%] rounded-sm bg-white/45" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-[8%] py-[12%]">
        <NameBar spec={spec} />
        <Rule spec={spec} />
        <Line w="92%" />
        <Line w="80%" />
        <Line w="86%" />
        <Rule spec={spec} />
        <Line w="70%" />
      </div>
    </div>
  );
}

function PhotoSketch({ spec }: { spec: ThumbSpec }) {
  return (
    <div className="flex h-full flex-col gap-[7px] p-[9%]">
      <div className="flex gap-2">
        <div className={cn("aspect-[4/5] w-[38%] rounded-[3px] opacity-85", spec.accentBg)} />
        <div className="flex flex-1 flex-col justify-center gap-[5px]">
          <NameBar spec={spec} />
          <Line w="60%" tone="bg-slate-300" />
        </div>
      </div>
      <Rule spec={spec} />
      <Line w="90%" />
      <Line w="80%" />
      <Line w="86%" />
    </div>
  );
}
