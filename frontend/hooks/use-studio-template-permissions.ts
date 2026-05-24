/**
 * use-studio-template-permissions.ts — viewer-scoped permissions for a
 * single studio template (the marketplace SKU shape, not the local
 * studio project). Used by:
 *
 *   • the template marketplace card's [🌐 Details] drawer
 *   • the studio video <EntityDetailsSheet> (which delegates here from
 *     `useEntityDetailsPermission({ kind: "video", … })` since
 *     videos and templates share the same creator-attribution rule —
 *     the creator + admins can see stats, viewers can't)
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface TemplateLike {
  id: string;
  creatorUserId?: string | null;
  /** Studio project shape uses `userId` instead of creatorUserId. The
   *  hook accepts either so the kind=video branch of
   *  useEntityDetailsPermission can hand the project row in without
   *  re-mapping. */
  userId?: string | null;
}

interface TemplatePermissions {
  isOwner: boolean;
  canViewStats: boolean;
}

const NULL: TemplatePermissions = { isOwner: false, canViewStats: false };

export function useStudioTemplatePermissions(
  template: TemplateLike | null | undefined,
): TemplatePermissions {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin } = usePermissions();

  if (!template) return NULL;
  const ownerId = template.creatorUserId ?? template.userId ?? null;
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId);
  return {
    isOwner,
    canViewStats: isOwner || isAdmin || isSuperAdmin,
  };
}
