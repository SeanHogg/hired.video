/**
 * Engagement tab body for the project details drawer.
 *
 * The /studio landing card opens this sheet without a live canvas, so
 * ChapterEditor used to fall back to a single Intro @ 0s. This tab:
 *   1. Derives scene boundaries + duration from timelineSpec / script /
 *      storyboard on the DTO (same mapping the editor Actions panel uses).
 *   2. Lazy-loads GET /api/studio/projects/:id when the list DTO omitted
 *      those fields.
 *   3. Renders the scene-boundary track (visible seed source) and mounts
 *      EngagementToolset so the Chapter / Thumbnails dialogs receive
 *      `sceneBoundaries` and `durationSec`.
 *   4. Keeps the existing read-only results panel below.
 *
 * Hosted by ProjectDetailsSheet (lazy import + `<EngagementTab project={project} />`).
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { studioService } from "@/lib/services/studio-service";

import { SceneBoundaryTrack } from "./SceneBoundaryTrack";
import {
  chapterSeedFromProject,
  hasSeedSource,
  type ChapterSeedSource,
} from "./scene-boundaries";

const EngagementToolset = lazy(
  () => import("@/components/studio/shared/EngagementToolset"),
);
const EngagementResultsPanel = lazy(
  () => import("@/components/studio/shared/EngagementResultsPanel"),
);

export interface EngagementTabProject extends ChapterSeedSource {
  id: string;
  videoUrl?: string | null;
}

interface Props {
  project: EngagementTabProject;
}

export default function EngagementTab({ project }: Props) {
  const { t } = useTranslation();
  const localSeed = useMemo(() => chapterSeedFromProject(project), [project]);
  const needsFetch = !hasSeedSource(project);
  const [fetched, setFetched] = useState<EngagementTabProject | null>(null);
  const [loading, setLoading] = useState(needsFetch);

  useEffect(() => {
    if (!needsFetch) {
      setFetched(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    studioService
      .getProject(project.id)
      .then((full) => {
        if (!cancelled) setFetched(full.data);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, project.id]);

  const seed = fetched ? chapterSeedFromProject(fetched) : localSeed;
  const videoUrl = fetched?.videoUrl ?? project.videoUrl ?? null;

  return (
    <div className="space-y-6">
      {loading ? (
        <div
          data-testid="scene-boundary-loading"
          className="flex items-center justify-center py-6 text-sm text-muted-foreground"
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("studio.engagement.loadingSeed", {
            defaultValue: "Loading scene boundaries…",
          })}
        </div>
      ) : (
        <SceneBoundaryTrack seed={seed} />
      )}
      <Suspense fallback={null}>
        <EngagementToolset
          projectId={project.id}
          sceneBoundaries={seed.sceneBoundaries}
          durationSec={seed.durationSec > 0 ? seed.durationSec : undefined}
          videoUrl={videoUrl}
        />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("studio.engagement.loadingResults", {
              defaultValue: "Loading viewer engagement…",
            })}
          </div>
        }
      >
        <EngagementResultsPanel projectId={project.id} />
      </Suspense>
    </div>
  );
}
