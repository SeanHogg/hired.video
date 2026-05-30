/**
 * #937 — Consumer-side mediaKind dispatcher. Single source of truth
 * for "play this studio project" across every surface (EntityVideos
 * rail, /v/:slug public page, marketplace previews, search results).
 *
 * Self-gating per kind: returns an "Open in studio" placeholder for
 * kinds whose play runtime isn't shipped, so a podcast attached to a
 * Resume renders a sensible button instead of an empty surface.
 *
 * Backwards compatibility: where today's consumers use
 * `<StudioVideoSurface mode="lazy" videoId={id} />`, swap to
 * `<ProjectPlayer mode="lazy" project={...} />` — the underlying
 * video case calls the same `<StudioVideoSurface/>` so the existing
 * rendered-MP4 / unrendered-timeline branches keep working.
 */

import { Suspense, lazy } from "react";
import { ExternalLink, Loader2, Music, Image as ImageIcon, GamepadIcon, Drama, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { MediaKind } from "@shared/media-kinds";

interface PlayableProject {
  id: string;
  mediaKind: MediaKind;
  title?: string | null;
  /** Rendered output (MP4 for video, MP3/WAV for podcast/voice, ZIP for
   *  game, PNG for image, …) when the export has completed. Null for
   *  unrendered projects — the kind-specific runtime still plays from
   *  the raw state in that case. */
  outputUrl?: string | null;
  /** Static thumbnail (cover image / poster). */
  posterUrl?: string | null;
}

interface ProjectPlayerProps {
  project: PlayableProject;
  mode?: "lazy" | "eager";
  /** When the runtime isn't shipped for this kind, the placeholder
   *  links here. Defaults to `/studio/projects/:id`. */
  studioHref?: string;
}

// Game / comic / image runtimes load lazily — keep them out of the
// hot consumer bundle.
const GameStagePlayer = lazy(() => import("@/components/studio/game/GameStage"));

export default function ProjectPlayer({ project, mode = "lazy", studioHref }: ProjectPlayerProps) {
  const fallbackHref = studioHref ?? `/studio/projects/${project.id}`;

  switch (project.mediaKind) {
    case "video":
    case "animation":
      return <StudioVideoSurface mode={mode} videoId={project.id} />;

    case "podcast":
    case "voice":
      if (!project.outputUrl) {
        return (
          <RuntimePlaceholder
            icon={<Music className="h-5 w-5" />}
            label="Audio render pending"
            href={fallbackHref}
            project={project}
          />
        );
      }
      return (
        <audio
          controls
          preload="none"
          className="w-full rounded-md bg-card border"
          src={project.outputUrl}
        >
          Your browser doesn't support audio playback.
        </audio>
      );

    case "image":
      return (
        <img
          src={project.outputUrl ?? project.posterUrl ?? ""}
          alt={project.title ?? ""}
          className="w-full rounded-md object-cover"
        />
      );

    case "game":
      return (
        <Suspense fallback={<div className="aspect-video flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
          {/* GameStage self-gates on `mode === "play"` and reads
              gameState from the project — placeholder for now since
              the production runtime is gated on #1789. The mode prop
              tells the editor-side stage to skip selection chrome and
              run the simulated path. */}
          <GameStagePlayer projectId={project.id} mode="play" />
        </Suspense>
      );

    case "comic":
    case "interactive_comic":
      return (
        <RuntimePlaceholder
          icon={<Drama className="h-5 w-5" />}
          label="Comic reader"
          href={fallbackHref}
          project={project}
        />
      );

    case "cad":
    case "cad_3d":
      return (
        <RuntimePlaceholder
          icon={<FileCode className="h-5 w-5" />}
          label="CAD viewer"
          href={fallbackHref}
          project={project}
        />
      );

    default: {
      // Exhaustive — TypeScript catches a missing kind here when
      // MediaKind grows. The runtime fallback keeps the consumer
      // surface usable.
      const _exhaustive: never = project.mediaKind;
      void _exhaustive;
      return (
        <RuntimePlaceholder
          icon={<ImageIcon className="h-5 w-5" />}
          label="Unknown project kind"
          href={fallbackHref}
          project={project}
        />
      );
    }
  }
}

function RuntimePlaceholder({
  icon,
  label,
  href,
  project,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  project: PlayableProject;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-6 flex flex-col items-center justify-center text-center min-h-[160px]">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      {project.title && <div className="font-medium mt-2">{project.title}</div>}
      <Button asChild variant="outline" size="sm" className="mt-3">
        <a href={href} target="_blank" rel="noopener noreferrer">
          Open in Studio <ExternalLink className="h-3.5 w-3.5 ml-1" />
        </a>
      </Button>
    </div>
  );
}
