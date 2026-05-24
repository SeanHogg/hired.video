/**
 * use-profile-permissions.ts — viewer-scoped permissions for a single
 * profile (a user's public page). The profile artifact_id IS the
 * owning user id, so "isOwner" reduces to a self-id check.
 *
 * Stats on someone else's profile leak signal (who looked, how long)
 * that the profile owner shouldn't share — only the owner + admins
 * see the drawer.
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface ProfileLike {
  id: string;
}

interface ProfilePermissions {
  isOwner: boolean;
  canViewStats: boolean;
}

const NULL: ProfilePermissions = { isOwner: false, canViewStats: false };

export function useProfilePermissions(
  profile: ProfileLike | null | undefined,
): ProfilePermissions {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin } = usePermissions();

  if (!profile) return NULL;
  const isOwner = Boolean(user?.id && user.id === profile.id);
  const adminLike = isOwner || isAdmin || isSuperAdmin;
  return {
    isOwner,
    canViewStats: adminLike,
  };
}
