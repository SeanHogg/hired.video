/**
 * use-service-permissions.ts — viewer-scoped permissions for a single
 * service listing. Provider + admins see stats; clients browsing
 * services don't.
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface ServiceLike {
  id: string;
  providerUserId?: string | null;
}

interface ServicePermissions {
  isOwner: boolean;
  canViewStats: boolean;
}

const NULL: ServicePermissions = { isOwner: false, canViewStats: false };

export function useServicePermissions(
  service: ServiceLike | null | undefined,
): ServicePermissions {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin } = usePermissions();

  if (!service) return NULL;
  const isOwner = Boolean(
    user?.id && service.providerUserId && user.id === service.providerUserId,
  );
  return {
    isOwner,
    canViewStats: isOwner || isAdmin || isSuperAdmin,
  };
}
