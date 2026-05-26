/**
 * use-course-permissions.ts — viewer-scoped permissions for a single
 * course. Mirrors the shape of use-article-permissions /
 * use-company-permissions: owner OR admin can edit, everyone else
 * gets a read-only view.
 *
 * Single seam consumed by `<CourseLearner>`'s edit affordance
 * (#1521) and any future surface that needs the same check (the
 * public course detail page, the Studio "Use as lesson" dialog,
 * etc). No `canEdit` boolean is ever prop-drilled — callers ask
 * the hook directly.
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface CourseLike {
  id?: string;
  userId?: string;
}

interface CoursePermissions {
  isOwner: boolean;
  canEdit: boolean;
}

const NULL: CoursePermissions = { isOwner: false, canEdit: false };

export function useCoursePermissions(
  course: CourseLike | null | undefined,
): CoursePermissions {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();

  if (!course) return NULL;
  const isOwner = Boolean(
    user?.id && course.userId && user.id === course.userId,
  );
  return {
    isOwner,
    canEdit: isOwner || isSuperAdmin,
  };
}
