/**
 * /studio — StudioLanding (the studio home) for EVERY visitor. Signed-out
 * visitors get the same templates + "My content" layout a signed-in user
 * sees, topped with a marketing hero (StudioLanding self-gates the header +
 * the empty "My content" state on `!user`).
 *
 * Every workspace URL (/studio/new, /studio/:id and /studio/resume/:resumeId) is StudioWorkspace — a career kit or a studio format in
 * the one frame (lib/workspace/workspace-route.ts decides which).
 */
import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import StudioLoadingShell from "./StudioLoadingShell";

const StudioLanding = lazy(() => import("./StudioLanding"));

export default function StudioRoot() {
  const { isLoading } = useAuth();
  if (isLoading) return <StudioLoadingShell />;
  return (
    <Suspense fallback={<StudioLoadingShell />}>
      <StudioLanding />
    </Suspense>
  );
}
