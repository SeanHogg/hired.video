// Mock "slide preview" rendered inside each /studio template card. One
// switch per `template.id` so each template gets a unique visual identity
// (background, accent shape, title treatment) — modelled on PowerPoint /
// Canva template grids. Pure CSS + inline SVG, no image assets needed.

import { cn } from "@/lib/utils";
import type { ContentTemplate, TemplateDef } from "./catalog";

interface TemplateThumbProps {
  template: TemplateDef;
  className?: string;
}

export default function TemplateThumb({ template, className }: TemplateThumbProps) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-md",
        className,
      )}
    >
      {renderThumb(template.id)}
    </div>
  );
}

function renderThumb(id: ContentTemplate) {
  switch (id) {
    case "basic":
      return (
        <div className="absolute inset-0 bg-slate-100 p-3">
          <div className="h-3/5 w-full rounded-sm bg-gradient-to-br from-slate-300 to-slate-400" />
          <div className="mt-2 h-1.5 w-2/3 rounded-sm bg-slate-700" />
          <div className="mt-1 h-1 w-1/3 rounded-sm bg-slate-400" />
        </div>
      );

    case "profile":
      return (
        <div className="absolute inset-0 flex bg-[#e9e3da]">
          <div className="m-2 w-2/5 rounded-sm bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23c9bfae%22/><circle cx=%2250%22 cy=%2240%22 r=%2218%22 fill=%22%23a89882%22/><rect x=%2225%22 y=%2260%22 width=%2250%22 height=%2230%22 rx=%2010%22 fill=%22%23a89882%22/></svg>')] bg-cover" />
          <div className="flex flex-1 flex-col justify-center pr-3">
            <div className="text-[10px] font-semibold tracking-wider text-slate-700">
              PRESENTATION
            </div>
            <div className="text-[10px] font-semibold tracking-wider text-slate-700">
              TITLE
            </div>
            <div className="mt-1 text-[6px] tracking-widest text-slate-500">
              PRESENTATION SUBTITLE
            </div>
          </div>
        </div>
      );

    case "resume":
      return (
        <div className="absolute inset-0 bg-white p-3">
          <div className="h-1.5 w-1/3 rounded-sm bg-slate-800" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="h-1 w-full rounded-sm bg-slate-300" />
              <div className="h-1 w-5/6 rounded-sm bg-slate-300" />
              <div className="h-1 w-4/6 rounded-sm bg-slate-300" />
              <div className="h-1 w-full rounded-sm bg-slate-300" />
            </div>
            <div className="space-y-1">
              <div className="h-1 w-full rounded-sm bg-slate-300" />
              <div className="h-1 w-3/4 rounded-sm bg-slate-300" />
              <div className="h-1 w-full rounded-sm bg-slate-300" />
              <div className="h-1 w-2/3 rounded-sm bg-slate-300" />
            </div>
          </div>
          <div className="absolute bottom-2 right-3 text-[8px] font-bold tracking-widest text-rose-500">
            RESUME
          </div>
        </div>
      );

    case "personal_brand":
      return (
        <div className="absolute inset-0 flex flex-col justify-center bg-slate-900 px-4">
          <div className="text-[11px] font-bold leading-tight text-white">
            PRESENTATION
          </div>
          <div className="text-[11px] font-bold leading-tight text-white">
            TITLE
          </div>
          <div className="mt-2 h-px w-3/5 bg-rose-400" />
          <div className="mt-1 text-[6px] tracking-widest text-slate-400">
            Presentation subtitle
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl text-rose-400">
            ✶
          </div>
        </div>
      );

    case "skills_demo":
      return (
        <div className="absolute inset-0 flex flex-col justify-center bg-white px-3">
          <div className="text-[14px] font-extrabold leading-[1] text-slate-900">
            PRES
          </div>
          <div className="text-[14px] font-extrabold leading-[1] text-slate-900">
            TITLE
          </div>
          <div className="absolute bottom-2 right-3 flex gap-1">
            <div className="h-3 w-1 rounded-full bg-brand-purple" />
            <div className="h-4 w-1 rounded-full bg-brand-purple" />
            <div className="h-5 w-1 rounded-full bg-brand-purple" />
          </div>
        </div>
      );

    case "code_walkthrough":
      return (
        <div className="absolute inset-0 bg-slate-950 p-3 font-mono">
          <div className="text-[6px] text-emerald-400">{"> npm run dev"}</div>
          <div className="mt-1 h-1 w-2/3 rounded-sm bg-sky-500/60" />
          <div className="mt-1 h-1 w-3/4 rounded-sm bg-purple-400/60" />
          <div className="mt-1 h-1 w-1/2 rounded-sm bg-amber-400/60" />
          <div className="mt-1 h-1 w-5/6 rounded-sm bg-pink-400/60" />
          <div className="mt-1 h-1 w-2/5 rounded-sm bg-emerald-400/60" />
          <div className="absolute bottom-2 right-3 text-[8px] font-bold text-white">
            {"</code>"}
          </div>
        </div>
      );

    case "design_portfolio":
      return (
        <div className="absolute inset-0 bg-[#efe9e1]">
          <svg
            viewBox="0 0 100 56"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 h-full w-full"
          >
            <path
              d="M5 56 L5 28 A20 20 0 0 1 45 28 L45 56 Z"
              fill="#b8a89a"
            />
            <circle cx="22" cy="36" r="5" fill="#7a6b5a" />
          </svg>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-right">
            <div className="text-[9px] font-semibold tracking-wider text-slate-700">
              PRESENTATION
            </div>
            <div className="text-[9px] font-semibold tracking-wider text-slate-700">
              TITLE
            </div>
          </div>
        </div>
      );

    case "data_analysis":
      return (
        <div className="absolute inset-0 bg-white p-3">
          <div className="text-[7px] font-semibold uppercase tracking-wider text-slate-700">
            Q3 Insights
          </div>
          <div className="mt-2 flex h-3/5 items-end gap-1">
            <div className="h-2/5 flex-1 rounded-sm bg-sky-400" />
            <div className="h-3/5 flex-1 rounded-sm bg-sky-500" />
            <div className="h-4/5 flex-1 rounded-sm bg-brand-purple" />
            <div className="h-1/2 flex-1 rounded-sm bg-sky-400" />
            <div className="h-full flex-1 rounded-sm bg-brand-blue" />
            <div className="h-2/3 flex-1 rounded-sm bg-sky-500" />
          </div>
          <div className="absolute bottom-2 left-3 right-3 h-px bg-slate-300" />
        </div>
      );

    case "job_ad":
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-purple to-brand-blue p-3 text-white">
          <div className="text-[7px] font-semibold uppercase tracking-widest opacity-80">
            We&rsquo;re hiring
          </div>
          <div className="mt-1 text-[11px] font-bold leading-tight">
            Senior
          </div>
          <div className="text-[11px] font-bold leading-tight">Engineer</div>
          <div className="absolute bottom-2 right-3 rounded-full bg-white px-2 py-0.5 text-[7px] font-semibold text-brand-purple">
            Apply →
          </div>
        </div>
      );

    case "company_promo":
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-brand-purple to-brand-blue p-3 text-white">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-sm bg-white" />
            <div className="text-[6px] font-bold tracking-widest opacity-90">
              ACME CO.
            </div>
          </div>
          <div className="mt-3 text-[10px] font-bold leading-tight">
            Build with us.
          </div>
          <div className="mt-1 h-px w-1/3 bg-white/60" />
          <div className="mt-1 text-[6px] opacity-70">
            Join 200+ engineers shipping daily.
          </div>
        </div>
      );

    case "sizzle_reel":
      return (
        <div className="absolute inset-0 overflow-hidden bg-sky-200">
          <div className="absolute -left-4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute left-12 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute left-28 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute bottom-2 left-3 text-[10px] font-semibold text-slate-900">
            Sizzle Reel
          </div>
          <div className="absolute right-2 top-2 text-[6px] tracking-widest text-slate-700">
            PRESENTATION
          </div>
        </div>
      );

    case "tool_promo":
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-fuchsia-500 p-3 text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/20 text-base">
            🔧
          </div>
          <div className="mt-2 text-[10px] font-bold leading-tight">
            New Tool
          </div>
          <div className="text-[10px] font-bold leading-tight">Drop</div>
          <div className="mt-1 text-[6px] opacity-80">30-second demo</div>
        </div>
      );
  }
}
