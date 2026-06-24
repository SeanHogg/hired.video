/**
 * Studio route dispatcher (V2 only).
 *
 *   /studio        →  StudioLanding (the workspace) for EVERY visitor.
 *                     Signed-out visitors get the same templates +
 *                     "My content" layout a signed-in user sees, topped
 *                     with a marketing hero (StudioLanding self-gates the
 *                     header + the empty "My content" state on `!user`).
 *   /studio/:id    →  StudioEditorV2
 *
 * The classic v1 editor + the v1/v2 opt-in toggle have been removed from the
 * user-facing flow. The old signed-out marketing landing lived inside
 * `StudioLayout` (the unmaintained v1 surface); it no longer renders here —
 * StudioLanding owns the signed-out marketing header now.
 */
import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import StudioLoadingShell from "./StudioLoadingShell";

const StudioLanding = lazy(() => import("./StudioLanding"));
const StudioEditorV2 = lazy(() => import("./v2/StudioEditorV2"));

export default function StudioRoot() {
  const { isLoading } = useAuth();
  if (isLoading) return <StudioLoadingShell />;
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
