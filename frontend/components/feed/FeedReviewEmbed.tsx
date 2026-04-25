/**
 * Inline review card for the dashboard feed. Rendered when a feed
 * post has subjectType='review'. Reads the cached `embedPayload` for
 * the headline display so the feed list stays one query, then
 * lazy-loads the threaded comments through the canonical
 * /api/reviews/:reviewId/comments endpoint — meaning a comment
 * posted from the feed is the same comment seen on the subject's
 * detail page.
 */

import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { RatingStars } from "@/components/ui/RatingStars";
import { ReviewComments } from "@/components/reviews/ReviewComments";

interface FeedReviewEmbedProps {
  reviewId: string;
  embedPayload: Record<string, unknown> | undefined;
}

interface NormalizedEmbed {
  overallRating: number | null;
  title: string | null;
  excerpt: string | null;
  subjectPath: string | null;
  subjectNoun: string | null;
  isVerified: boolean;
  verificationMethod: string | null;
}

function normalize(payload: Record<string, unknown> | undefined): NormalizedEmbed {
  const p = payload ?? {};
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  const bool = (k: string) => (typeof p[k] === "boolean" ? (p[k] as boolean) : false);
  return {
    overallRating: num("overallRating"),
    title: str("title"),
    excerpt: str("excerpt"),
    subjectPath: str("subjectPath"),
    subjectNoun: str("subjectNoun"),
    isVerified: bool("isVerified"),
    verificationMethod: str("verificationMethod"),
  };
}

export function FeedReviewEmbed({ reviewId, embedPayload }: FeedReviewEmbedProps) {
  const e = normalize(embedPayload);

  return (
    <div className="space-y-3">
      <Card className="border-muted-foreground/20 bg-muted/30">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {e.overallRating !== null && (
              <>
                <RatingStars value={e.overallRating} size="sm" />
                <span className="text-xs font-medium">{e.overallRating.toFixed(1)}</span>
              </>
            )}
            {e.isVerified && (
              <Badge
                variant="secondary"
                className="text-xs gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                <BadgeCheck className="h-3 w-3" />
                {e.verificationMethod === "was_buyer" ? "Verified buyer" : "Verified employee"}
              </Badge>
            )}
            {e.subjectNoun && e.subjectPath && (
              <Link
                to={e.subjectPath}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                View {e.subjectNoun} <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
          {e.title && <h4 className="font-semibold text-sm leading-snug">{e.title}</h4>}
          {e.excerpt && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{e.excerpt}</p>
          )}
        </CardContent>
      </Card>

      {/* Threaded comments — the same canonical thread shown on the
          subject's detail page. Posting from here writes to the
          review's comment stream, not feedPostComments. */}
      <ReviewComments reviewId={reviewId} />
    </div>
  );
}
