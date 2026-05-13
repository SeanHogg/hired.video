/**
 * Studio route dispatcher.
 *
 *   /studio        →  StudioRoot
 *                       ├─ unauthenticated → marketing landing (lives in
 *                       │   StudioLayout, which renders its own Landing when
 *                       │   no user is signed in)
 *                       └─ authenticated   → StudioLanding (PowerPoint-style
 *                           chooser; auto-forwards to /studio/new when a
 *                           legacy editor deep-link param is present)
 *
 *   /studio/:id    →  StudioProjectRoute
 *                       ├─ editor preference = v2 → StudioEditorV2
 *                       └─ editor preference = classic → StudioLayout (the
 *                           existing 3-panel editor reads useParams.id and
 *                           loads that project)
 *
 * Single source of truth: `useEditorPreference()` is the only thing that
 * decides which editor opens at /studio/:id — no consumer re-derives the
 * gate, no prop-drilled `isV2` boolean.
 */
import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
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
  const { isV2 } = useEditorPreference();
  if (isV2) {
    return (
      <Suspense fallback={<Loading />}>
        <StudioEditorV2 />
      </Suspense>
    );
  }
  // Classic editor: StudioLayout reads useParams().id internally (via the
  // routeParams hook) so we don't need to thread it through props.
  return <StudioLayout />;
}

function Loading() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
