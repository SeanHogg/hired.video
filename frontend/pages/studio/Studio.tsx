/**
 * Studio route dispatcher (V2 only).
 *
 *   /studio        →  StudioRoot
 *                       ├─ unauthenticated → StudioLayout's marketing
 *                       │   landing (the only piece of v1 we still
 *                       │   render — the marketing surface predates
 *                       │   editor v1 vs v2 and serves both)
 *                       └─ authenticated   → StudioLanding (chooser)
 *
 *   /studio/:id    →  StudioEditorV2
 *
 * The "classic" editor (v1) is no longer reachable. The opt-in toggle
 * + preference hook have been removed; v2 is the only editor. Existing
 * v1 projects (kind='scene', VideoScript-shaped) hydrate into v2 via
 * `scriptToCanvasState` inside StudioEditorV2's load path.
 */
import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import StudioLayout from "./StudioLayout";

const StudioLanding = lazy(() => import("./StudioLanding"));
const StudioEditorV2 = lazy(() => import("./v2/StudioEditorV2"));

export default function StudioRoot() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <StudioLayout />;
  return (
    <Suspense fallback={<Loading />}>
      <StudioLanding />
    </Suspense>
  );
}

export function StudioProjectRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <StudioEditorV2 />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
