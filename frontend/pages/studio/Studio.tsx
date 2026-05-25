/**
 * Studio route dispatcher (V2 only).
 *
 *   /studio        →  unauth → StudioLayout's marketing landing
 *                              (kept for the signed-out hero/FAQ/CTA —
 *                              the v1 editor inside it never runs
 *                              because /studio/:id always routes to v2)
 *                       auth   → StudioLanding (chooser)
 *   /studio/:id    →  StudioEditorV2
 *
 * The classic v1 editor + the v1/v2 opt-in toggle have been removed
 * from the user-facing flow. V1 source files remain in the repo
 * (unmaintained) and will be deleted once every v1 capability has
 * been ported into v2.
 */
import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import StudioLayout from "./StudioLayout";
import StudioLoadingShell from "./StudioLoadingShell";

const StudioLanding = lazy(() => import("./StudioLanding"));
const StudioEditorV2 = lazy(() => import("./v2/StudioEditorV2"));

export default function StudioRoot() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <StudioLoadingShell />;
  // Unauthenticated visitors still see the marketing surface that lives
  // inside StudioLayout — the layout self-gates and returns its
  // <Landing /> when `!user`, so the v1 editor never mounts.
  if (!user) return <StudioLayout />;
  return (
    <Suspense fallback={<StudioLoadingShell />}>
      <StudioLanding />
    </Suspense>
  );
}

export function StudioProjectRoute() {
  return (
    <Suspense fallback={<StudioLoadingShell />}>
      <StudioEditorV2 />
    </Suspense>
  );
}
