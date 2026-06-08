// Post permalink / detail page (/feed/:id). Renders a single feed post
// full-width with its comment thread and the owner insights drawer. The
// server records an impression (artifact_views kind='post') on the GET, so
// simply landing here counts toward the author's analytics.

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { usePageChrome } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import FeedPostCard from "@/components/feed/FeedPostCard";
import { getFeedPost } from "@/lib/services/feed-service";
import type { FeedPost } from "@/types/feed";

export default function PostDetail() {
  usePageChrome();
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
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to feed
          </Link>
        </Button>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : notFound || !post ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">This post isn't available.</p>
            <Button variant="outline" className="mt-3" asChild>
              <Link to="/">Go to feed</Link>
            </Button>
          </div>
        ) : (
          <FeedPostCard
            post={post}
            onLike={() => void load()}
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
