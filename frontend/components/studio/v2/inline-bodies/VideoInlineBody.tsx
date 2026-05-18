/**
 * VideoInlineBody — renders one of the user's published studio
 * projects (or a draft) inside a `linked-content` canvas widget. Uses
 * the project's `socialCardImage` when present (the published social
 * preview), then `thumbnailUrl`, then a status-coloured gradient
 * placeholder — every fallback keeps the widget visually anchored
 * instead of empty.
 *
 * Why not iframe the actual `<StudioPlayer/>`? Mounting a real video
 * element inside a fractional canvas widget would auto-play / fetch
 * the MP4 every time the editor renders a frame — a sync of even
 * 5 video widgets would saturate the tab. The thumbnail + status
 * meta + floating CTA strikes the right balance: preview shows what
 * the video IS, the CTA opens the live player.
 */
import { useEffect, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface VideoInlineBodyProps {
  id: string;
}

export default function VideoInlineBody({ id }: VideoInlineBodyProps) {
  const [project, setProject] = useState<StudioProject | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    studioService
      .getProject(id)
      .then((res) => {
        if (cancelled) return;
        const p = res.data ?? null;
        setProject(p);
        setLoadState(p ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading video…" />;
  if (loadState === "error" || !project) {
    return <InlineBodyMessage label="Couldn't load this video." />;
  }

  const cover = project.socialCardImage ?? project.thumbnailUrl ?? null;
  const isPublished = project.isPublic && !!project.videoUrl;

  return (
    <ScaledTemplateFrame background="#0f172a">
      <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
        {cover ? (
          <img
            src={cover}
            alt={project.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-700 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-2xl">
            {isPublished ? (
              <Play className="h-10 w-10 translate-x-0.5" fill="currentColor" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <h1 className="text-2xl font-bold leading-tight">{project.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
            <span className="rounded-full bg-white/20 px-2 py-0.5 font-medium backdrop-blur-sm">
              {isPublished ? "Published" : project.status}
            </span>
            {project.viewCount > 0 && (
              <span>· {project.viewCount.toLocaleString()} views</span>
            )}
          </div>
          {project.metaDescription && (
            <p className="mt-2 line-clamp-2 text-sm opacity-90">
              {project.metaDescription}
            </p>
          )}
        </div>
      </div>
    </ScaledTemplateFrame>
  );
}
