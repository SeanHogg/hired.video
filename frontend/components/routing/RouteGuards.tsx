import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { publicProfilePath } from "@shared/public-paths";
import { useAuth, useVerificationBlocked } from "@/lib/auth";
import { isVerificationAllowedPath } from "@/lib/routing/verification-allowed-paths";

// Loading component
export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

function useAuthSafe() {
  // Directly use the Auth context; avoid brittle require()-based fallback that can misreport state
  return useAuth();
}

// Simple route guards
export function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuthSafe();
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return children;
}

export function RequireVerified({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuthSafe();
  const blocked = useVerificationBlocked();
  // Avoid false redirects while auth/verification status is initializing
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  if (blocked) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/verify-email?${params.toString()}`} replace />;
  }
  return children;
}

// Any authenticated route is blocked until email is verified. Runs once for the
// whole app so individual <Route> entries don't each need <RequireVerified>.
// Shares the verification predicate with <AppShell> and <GlobalChrome> via
// `useVerificationBlocked` — single source of truth for "user in limbo."
// Allowed paths (including `/` itself — #1658) live in
// `lib/routing/verification-allowed-paths.ts`.
export function GlobalVerificationGate({ children }: { children: ReactNode }) {
  const blocked = useVerificationBlocked();
  const location = useLocation();

  if (!blocked) return children as JSX.Element;

  const allowed = isVerificationAllowedPath(location.pathname);
  if (allowed) return children as JSX.Element;

  const intended = location.pathname + location.search;
  const params = new URLSearchParams({ redirect: intended });
  return <Navigate to={`/verify-email?${params.toString()}`} replace />;
}

// /profile → /people/{user.id} (or /people/{slug} if available). Keeps the
// legacy URL working for nav links, emails, and deep-linking without a
// dedicated Profile page — one canonical owner view at /people/:id.
export function ProfileRedirect() {
  const { user, isAuthenticated, isLoading } = useAuthSafe();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    const intended = "/profile";
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  const target = user?.slug || user?.id;
  if (!target) return <PageLoader />;
  return <Navigate to={publicProfilePath(target)} replace />;
}
