import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useModuleActive } from "@/lib/hooks/useModuleStatus";
import { Loader2 } from "lucide-react";

interface ModuleGateProps {
  slug: string;
  children: ReactNode;
  /** Shown while the status fetch is in flight. */
  loadingFallback?: ReactNode;
  /**
   * Rendered when the module is disabled. When omitted, the user is redirected
   * to `redirectTo` (default "/"). Pass an explicit node to render in-place
   * (e.g. inside a menu or nav item) instead of redirecting.
   */
  disabledFallback?: ReactNode;
  redirectTo?: string;
}

const DEFAULT_LOADER = (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
  </div>
);

export function ModuleGate({
  slug,
  children,
  loadingFallback = DEFAULT_LOADER,
  disabledFallback,
  redirectTo = "/",
}: ModuleGateProps) {
  const { active, loading } = useModuleActive(slug);
  if (loading) return <>{loadingFallback}</>;
  if (active === false) {
    if (disabledFallback !== undefined) return <>{disabledFallback}</>;
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}

export default ModuleGate;
