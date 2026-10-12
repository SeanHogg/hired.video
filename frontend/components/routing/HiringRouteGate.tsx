/**
 * HiringRouteGate — wraps every hiring-side (recruiter / employer) route.
 *
 * hired.video is job-seeker focused; the hiring surfaces are switched off by
 * the single persona switch `HIRING_PERSONAS_ENABLED` (shared/user-roles.ts).
 * While it is off, visiting a hiring route redirects home instead of rendering
 * a half-working recruiter tool. Data behind these pages is untouched — flip
 * the switch and the routes come straight back.
 */
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

export interface HiringRouteGateProps {
  children: ReactNode;
  /** Injectable for tests; production callers omit it. */
  enabled?: boolean;
}

export function HiringRouteGate({
  children,
  enabled = HIRING_PERSONAS_ENABLED,
}: HiringRouteGateProps): JSX.Element {
  if (!enabled) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default HiringRouteGate;
