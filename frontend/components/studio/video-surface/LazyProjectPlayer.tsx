import { lazy, Suspense, useEffect, useState } from "react";

import type { PublicVideoReady } from "@/lib/studio/public-video-schema";

// ─── ProjectPlayer dynamic import ──────────────────────────────────────────
// `<ProjectPlayer/>` itself imports this module (the eager-Timeline
// branch delegates back here), so we can't have a static import or
// a circular module evaluation lands one of us with `undefined`. The
// React.lazy split-point breaks the cycle at module-load — the
// dynamic import only resolves the first time the lazy branch
// renders, by which point both modules are fully evaluated. Single
// SSoT (ProjectPlayer) for kind dispatch, no duplicated branches.

const ProjectPlayerLazy = lazy(() =>
  import("@/components/studio/shared/ProjectPlayer"),
);

export default function LazyProjectPlayer({
  ready,
  analyticsProjectId,
}: {
  ready: PublicVideoReady;
  analyticsProjectId?: string;
}) {
  // Inline dynamic import of the adapter too — keeps the
  // public-payload-to-StudioProject mapping in one place
  // (`lib/studio/public-payload.ts`) without forcing a static import
  // chain that would pull StudioProject typings into every consumer.
  const [project, setProject] = useState<
    import("@/lib/services/studio-service").StudioProject | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/studio/public-payload").then((m) => {
      if (cancelled) return;
      setProject(m.publicReadyToProject(ready));
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  if (!project) return null;
  return (
    <Suspense fallback={null}>
      <ProjectPlayerLazy
        project={project}
        eagerReady={ready}
        videoSurfaceProps={{ analyticsProjectId }}
      />
    </Suspense>
  );
}
