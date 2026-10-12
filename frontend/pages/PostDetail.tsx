// Post permalink / detail page (/feed/:id). Renders a single feed post
// full-width with its comment thread and the owner insights drawer. The
// server records an impression (artifact_views kind='post') on the GET, so
// simply landing here counts toward the author's analytics.

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { usePageChrome } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { ReadingBackLink } from "@/components/content/ReadingLayout";
import { READING_COLUMN } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";
import FeedPostCard from "@/components/feed/FeedPostCard";
import { getFeedPost, applyReactionToPost } from "@/lib/services/feed-service";
import type { FeedPost } from "@/types/feed";

export default function PostDetail() {
  usePageChrome();
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    try {
      setPost(await getFeedPost(id));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell bgClassName="bg-background">
      <div className={cn(READING_COLUMN, "flex flex-col gap-4 pb-[72px] pt-6")}>
        <ReadingBackLink to="/">{t("postDetail.backToFeed")}</ReadingBackLink>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground" role="status">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        ) : notFound || !post ? (
          <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border bg-card px-6 py-14 text-center">
            <p className="text-muted-foreground">{t("postDetail.unavailable")}</p>
            <Button variant="outline" className="min-h-[44px]" asChild>
              <Link to="/">{t("postDetail.goToFeed")}</Link>
            </Button>
          </div>
        ) : (
          <FeedPostCard
            post={post}
            linkToDetail={false}
            onReact={(_id, reactionType) =>
              setPost((p) => (p ? applyReactionToPost(p, reactionType) : p))
            }
            onComment={() => undefined}
            onDelete={() => navigate("/")}
            onHide={() => navigate("/")}
            onEdit={(_id, updated) => setPost(updated)}
            onReshare={(created) => navigate(`/feed/${created.id}`)}
          />
        )}
      </div>
    </AppShell>
  );
}
