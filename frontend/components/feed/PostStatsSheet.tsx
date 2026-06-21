/**
 * PostStatsSheet — author analytics for a feed post, built on the shared
 * <EntityDetailsSheet> shell exactly like <ResumeStatsSheet>. Surfaces the
 * same Metrics-with-geography story every other artifact gets: impressions,
 * unique viewers, viewer list, and a world-map geography rollup
 * (<ArtifactAnalyticsDashboard kind="post"> → <MetricsPanel> + <GeoHotspotMap>).
 *
 * Self-gates per the DRY rule: returns null when the viewer isn't the post
 * author (or a super-admin) via useEntityDetailsPermission — the [🌐 Details]
 * trigger simply doesn't render for everyone else, matching the owner-only
 * backing endpoint GET /api/analytics/artifacts/post/:id.
 */
import { Eye, Globe, Heart, Lock, MessageCircle, Repeat2, Users } from "lucide-react";

import EntityDetailsSheet, {
  type EntityDetailsSection,
} from "@/components/shared/EntityDetailsSheet";
import { ArtifactAnalyticsDashboard } from "@/components/analytics";
import { Badge } from "@/components/ui/badge";
import { useEntityDetailsPermission } from "@/hooks/use-entity-details-permission";
import { formatDate } from "@/lib/utils";
import { reactionDef } from "@shared/feed-reactions";
import type { FeedPost } from "@/types/feed";

interface Props {
  post: FeedPost;
}

function privacyIcon(privacy: FeedPost["privacy"]) {
  switch (privacy) {
    case "Public":
      return <Globe className="w-3 h-3" />;
    case "Connections":
    case "recruiter":
      return <Users className="w-3 h-3" />;
    default:
      return <Lock className="w-3 h-3" />;
  }
}

function privacyLabel(privacy: FeedPost["privacy"]): string {
  switch (privacy) {
    case "Public":
      return "Public";
    case "Connections":
      return "Connections";
    case "recruiter":
      return "Recruiters";
    default:
      return "Private";
  }
}

export default function PostStatsSheet({ post }: Props) {
  const perms = useEntityDetailsPermission({
    kind: "post",
    entity: { id: post.id, userId: post.userId },
  });

  const chips = (
    <>
      <Badge variant="secondary" className="flex items-center gap-1">
        {privacyIcon(post.privacy)}
        {privacyLabel(post.privacy)}
      </Badge>
      {post.kind === "article" && <Badge variant="secondary">Article</Badge>}
      {post.repostOfId && <Badge variant="secondary">Repost</Badge>}
    </>
  );

  const sections: EntityDetailsSection[] = [
    {
      key: "metrics",
      label: "Metrics",
      render: () => (
        <ArtifactAnalyticsDashboard kind="post" artifactId={post.id} />
      ),
    },
    {
      key: "activity",
      label: "Activity",
      render: () => (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" /> Reactions
            </dt>
            <dd className="tabular-nums">{post.likeCount}</dd>
            <dt className="text-muted-foreground flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" /> Comments
            </dt>
            <dd className="tabular-nums">{post.commentCount}</dd>
            <dt className="text-muted-foreground flex items-center gap-1">
              <Repeat2 className="w-3.5 h-3.5" /> Reposts
            </dt>
            <dd className="tabular-nums">{post.repostCount}</dd>
            <dt className="text-muted-foreground flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Posted
            </dt>
            <dd>{formatDate(post.createdAt)}</dd>
          </dl>

          {/* Reaction breakdown by professional type. Self-gates: hidden
              until the post has reactions. */}
          {post.reactions && post.reactions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Reaction breakdown
              </p>
              <ul className="space-y-1.5">
                {post.reactions.map((b) => {
                  const def = reactionDef(b.type);
                  return (
                    <li key={b.type} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{def.emoji}</span>
                        {def.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{b.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <EntityDetailsSheet
      title="Post insights"
      subtitle="Impressions, viewers, and geography for your post."
      chips={chips}
      sections={sections}
      canView={perms.canViewStats}
      layout="tabs"
    />
  );
}
