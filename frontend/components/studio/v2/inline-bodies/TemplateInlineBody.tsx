/**
 * TemplateInlineBody — renders one of the user's studio templates
 * (video / document / résumé) inside a `linked-content` canvas widget.
 *
 * One kind, two looks: résumé templates (`documentKind 'resume'`) get a
 * light document card; every other studio template gets a dark cover
 * card. Both stay simple — title + discriminator subtitle + thumb when
 * the row has a `thumbnailUrl`. The canvas CTA opens the marketplace
 * listing; we do not mount the live editor or player here.
 */
import { useEffect, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import { isResumeStudioTemplate } from "@/lib/templates/resume-template-design";
import { linkedContentTemplateSubtitle } from "@/lib/studio/editor-v2/linked-content/template";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface TemplateInlineBodyProps {
  id: string;
}

export default function TemplateInlineBody({ id }: TemplateInlineBodyProps) {
  const [template, setTemplate] = useState<StudioTemplate | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    studioTemplatesService
      .getById(id)
      .then((t) => {
        if (cancelled) return;
        setTemplate(t);
        setLoadState(t ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading template…" />;
  if (loadState === "error" || !template) {
    return <InlineBodyMessage label="Couldn't load this template." />;
  }

  const isResume = isResumeStudioTemplate(template);
  const subtitle = linkedContentTemplateSubtitle(template);
  const thumb = template.thumbnailUrl ?? null;
  const title = template.name || "Untitled template";

  if (isResume) {
    return (
      <ScaledTemplateFrame background="#ffffff">
        <div className="bg-white px-10 py-8 text-slate-900">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-slate-100">
            {thumb ? (
              <img
                src={thumb}
                alt={title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-indigo-50 text-indigo-600">
                <LayoutTemplate className="h-16 w-16" />
              </div>
            )}
          </div>
          <h1 className="mt-6 text-2xl font-bold leading-tight">{title}</h1>
          <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
            {subtitle}
          </p>
        </div>
      </ScaledTemplateFrame>
    );
  }

  return (
    <ScaledTemplateFrame background="#0f172a">
      <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
        {thumb ? (
          <img
            src={thumb}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-2xl">
            <LayoutTemplate className="h-10 w-10" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
            <span className="rounded-full bg-white/20 px-2 py-0.5 font-medium backdrop-blur-sm">
              {subtitle}
            </span>
          </div>
        </div>
      </div>
    </ScaledTemplateFrame>
  );
}
