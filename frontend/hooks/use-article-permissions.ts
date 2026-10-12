/**
 * use-article-permissions.ts — viewer-scoped permissions for a single
 * article. Same shape as the other entity permission hooks (owner +
 * admins see stats; the public read of the article itself is gated
 * separately by the article's `isPublished` state, not this hook).
 */

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface ArticleLike {
  id: string;
  authorId?: string;
}

interface ArticlePermissions {
  isOwner: boolean;
  canViewStats: boolean;
}

const NULL: ArticlePermissions = { isOwner: false, canViewStats: false };

export function useArticlePermissions(
  article: ArticleLike | null | undefined,
): ArticlePermissions {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin } = usePermissions();

  if (!article) return NULL;
  const isOwner = Boolean(
    user?.id && article.authorId && user.id === article.authorId,
  );
  return {
    isOwner,
    canViewStats: isOwner || isAdmin || isSuperAdmin,
  };
}
