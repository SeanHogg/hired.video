import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Newspaper, BookOpen, HelpCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import { buildShareAction } from "@/lib/card-share-action";
import { articleCategoryI18nKey } from "@/lib/article-category";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import EntityMedia from "@/components/studio/EntityMedia";

// Unified search surfaces three static content types (articles, guides, FAQs)
// alongside dynamic DB cards. They share this presentation so the search
// results grid stays visually coherent regardless of source. Tools render via
// the catalog-aware <ToolCard> instead so /search and /tools stay identical.
interface ContentItem {
  id: string;
  type: "article" | "guide" | "faq";
  title?: string;
  name?: string;
  summary?: string;
  href?: string;
  category?: string;
  tier?: "free" | "pro";
  readingTime?: number;
  /** Author user id for `type === "article"` rows so the EntityMedia rail
   *  can mount the author's studio projects + the create chip self-gates
   *  via `useEntityOwnership` (gap #325). */
  userId?: string;
}

// i18n keys resolved at render (this map is module-level, before the hook is
// available). Icon stays here; label/cta are looked up per `item.type`.
const TYPE_META = {
  article: { icon: Newspaper, labelKey: "contentCard.type.article", ctaKey: "contentCard.cta.article" },
  guide: { icon: BookOpen, labelKey: "contentCard.type.guide", ctaKey: "contentCard.cta.guide" },
  faq: { icon: HelpCircle, labelKey: "contentCard.type.faq", ctaKey: "contentCard.cta.faq" },
} as const;

export default function ContentCard({ item }: { item: ContentItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const label = t(meta.labelKey);
  const title = item.title ?? item.name ?? "";
  const href = item.href ?? "#";

  const cardActions: DynamicCardAction[] = [
    {
      id: "open",
      label: t(meta.ctaKey),
      variant: "secondary",
      icon: ArrowRight,
      onClick: () => navigate(href),
    },
    buildShareAction({
      entityUrl: href,
      copySuccessDescription: t("contentCard.linkCopied", { label }),
    }),
  ];

  return (
    <BaseCard className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <Badge variant="outline" className="mb-1">
                {label}
              </Badge>
              <CardTitle className="text-base leading-snug line-clamp-2">
                <Link to={href} className="hover:text-primary transition-colors">
                  {title}
                </Link>
              </CardTitle>
            </div>
          </div>
          {item.tier === "pro" && <Badge variant="secondary">{t("labels.pro")}</Badge>}
        </div>
        {item.summary && (
          <CardDescription className="pt-2 line-clamp-3">
            {item.summary}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.category && (
            <span>
              {t(articleCategoryI18nKey(item.category), { defaultValue: item.category })}
            </span>
          )}
          {item.readingTime && (
            <span>{t("contentCard.minRead", { count: item.readingTime })}</span>
          )}
        </div>
        {/* Articles get the EntityMedia rail so the author's video promos
         *  / podcast episodes / linked studio projects surface inline (gap
         *  #325). The component is collapsed-by-default so it costs nothing
         *  until the viewer expands; the create chip self-gates against the
         *  authenticated viewer = article author check via useEntityOwnership. */}
        {item.type === "article" && (
          <EntityMedia
            subject={{ kind: "article", id: item.id }}
            ownerUserId={item.userId ?? null}
            className="mt-2"
          />
        )}
      </CardContent>
      <CardActions actions={cardActions} />
    </BaseCard>
  );
}
