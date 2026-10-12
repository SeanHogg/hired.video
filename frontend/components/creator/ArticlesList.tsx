// The Articles panel's list (split from ArticlesManagerPanel): the creator's
// pieces as ArticleListCards, or the empty state.

import { FileText } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import type { Article } from "@/lib/services/article-service";
import ArticleListCard from "./ArticleListCard";

interface ArticlesListProps {
  articles: Article[];
  onEdit: (a: Article) => void;
  onDetails: (a: Article) => void;
  onWithdraw: (a: Article) => void;
  onUnpublish: (a: Article) => void;
  onRemove: (a: Article) => void;
}

export default function ArticlesList({ articles, onEdit, onDetails, onWithdraw, onUnpublish, onRemove }: ArticlesListProps) {
  const { t } = useTranslation();
  if (articles.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3" />
        <p className="font-medium mb-1">{t("creator.articles.list.emptyTitle")}</p>
        <p className="text-sm mb-4">
          <Trans i18nKey="creator.articles.list.emptyBody" components={{ strong: <strong /> }} />
        </p>
      </CardContent></Card>
    );
  }
  return (
    <div className="space-y-3">
      {articles.map((a) => (
        <ArticleListCard
          key={a.id}
          article={a}
          onEdit={() => onEdit(a)}
          onDetails={() => onDetails(a)}
          onWithdraw={() => onWithdraw(a)}
          onUnpublish={() => onUnpublish(a)}
          onRemove={() => onRemove(a)}
        />
      ))}
    </div>
  );
}
