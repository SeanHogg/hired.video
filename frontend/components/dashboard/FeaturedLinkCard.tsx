import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import { buildShareAction } from "@/lib/card-share-action";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

/**
 * Generic featured card for items that aren't a first-class entity with a
 * dedicated card — i.e. the SuperAdmin pins an arbitrary app/marketing page
 * (the `page` feed-feature kind, e.g. the Chrome extension) or a custom
 * link. Renders title / summary / optional cover image + a CTA, styled to
 * sit alongside the entity cards in the dashboard feed.
 *
 * Tools (Career 360) render through the catalog-aware <ToolCard> instead;
 * this card is only the fallback for hrefs that have no richer renderer.
 */
export interface FeaturedLinkItem {
  id: string;
  title?: string;
  name?: string;
  summary?: string;
  href?: string;
  /** Optional cover image (coverImageUrl / thumbnail / image all accepted
   *  upstream; the renderer normalises to `image`). */
  image?: string;
  /** Optional short label shown on the type badge — defaults to "Featured". */
  badgeLabel?: string;
}

export function FeaturedLinkCard({ item }: { item: FeaturedLinkItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = item.title ?? item.name ?? "";
  const href = item.href ?? "#";
  const isExternal = /^https?:\/\//i.test(href);

  const open = () => {
    if (isExternal) window.open(href, "_blank", "noopener,noreferrer");
    else navigate(href);
  };

  const actions: DynamicCardAction[] = [
    {
      id: "open",
      label: t("actions.open", "Open"),
      variant: "secondary",
      icon: ArrowRight,
      onClick: open,
    },
    buildShareAction({
      entityUrl: href,
      copySuccessDescription: t("contentCard.linkCopied", { label: title }),
    }),
  ];

  return (
    <BaseCard className="flex flex-col h-full overflow-hidden">
      {item.image && (
        <Link to={href} className="block">
          <img
            src={item.image}
            alt={title}
            className="h-32 w-full object-cover"
            loading="lazy"
          />
        </Link>
      )}
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <Badge variant="outline" className="mb-1">
              {item.badgeLabel ?? t("labels.featured", "Featured")}
            </Badge>
            <CardTitle className="text-base leading-snug line-clamp-2">
              {isExternal ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors"
                >
                  {title}
                </a>
              ) : (
                <Link to={href} className="hover:text-primary transition-colors">
                  {title}
                </Link>
              )}
            </CardTitle>
          </div>
        </div>
        {item.summary && (
          <CardDescription className="pt-2 line-clamp-3">
            {item.summary}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto" />
      <CardActions actions={actions} />
    </BaseCard>
  );
}

export default FeaturedLinkCard;
