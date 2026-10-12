/**
 * One piece in the creator's Articles list (ArticlesManagerPanel): title,
 * kind / status / safety badges, summary, stats, and its actions — Edit opens
 * the body on the studio's document canvas (#2154a), Details the listing
 * form (cover, tags, kind, review), plus withdraw / unpublish / delete.
 */
import { useTranslation } from "react-i18next";
import { EyeOff, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Article, ArticleKind, ArticleStatus } from "@/lib/services/article-service";

const KIND_LABEL: Record<ArticleKind, string> = {
  article: "Article",
  faq: "FAQ",
  guide: "Guide",
};

function statusVariant(s: ArticleStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "published") return "default";
  if (s === "submitted") return "secondary";
  if (s === "rejected" || s === "flagged") return "destructive";
  return "outline";
}

interface ArticleListCardProps {
  article: Article;
  onEdit: () => void;
  onDetails: () => void;
  onWithdraw: () => void;
  onUnpublish: () => void;
  onRemove: () => void;
}

export default function ArticleListCard({ article: a, onEdit, onDetails, onWithdraw, onUnpublish, onRemove }: ArticleListCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{a.title}</h3>
            <Badge variant="outline" className="text-[10px]">{KIND_LABEL[a.kind]}</Badge>
            <Badge variant={statusVariant(a.status)} className="text-[10px]">
              {a.status}
            </Badge>
            {a.moderationScore != null && (
              <Badge variant="outline" className="text-[10px]">
                Safety {Math.round((a.moderationScore ?? 0) * 100)}/100
              </Badge>
            )}
          </div>
          {a.summary && <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>}
          {a.status === "rejected" && a.rejectionReason && (
            <p className="text-xs text-destructive">Rejected: {a.rejectionReason}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{a.readMinutes} min read</span>
            {a.viewCount > 0 && <span>{a.viewCount} views</span>}
            {a.category && <span>· {a.category}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* The body is authored on the studio's document canvas (#2154a);
              the listing details (cover, tags, kind, review) stay here. */}
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {t("actions.edit")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDetails}>
            {t("actions.details")}
          </Button>
          {a.status === "submitted" && (
            <Button size="sm" variant="ghost" onClick={onWithdraw} title="Withdraw from review">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {a.status === "published" && (
            <Button size="sm" variant="ghost" onClick={onUnpublish} title="Revert to draft">
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
