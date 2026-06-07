import { Link, useNavigate } from "react-router-dom";
import { Newspaper, BookOpen, HelpCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import { buildShareAction } from "@/lib/card-share-action";
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

const TYPE_META = {
  article: { icon: Newspaper, label: "Article", cta: "Read article" },
  guide: { icon: BookOpen, label: "Guide", cta: "Open guide" },
  faq: { icon: HelpCircle, label: "FAQ", cta: "See answer" },
} as const;

export default function ContentCard({ item }: { item: ContentItem }) {
  const navigate = useNavigate();
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const title = item.title ?? item.name ?? "";
  const href = item.href ?? "#";

  const cardActions: DynamicCardAction[] = [
    {
      id: "open",
      label: meta.cta,
      variant: "secondary",
      icon: ArrowRight,
      onClick: () => navigate(href),
    },
    buildShareAction({
      entityUrl: href,
      copySuccessDescription: `${meta.label} link has been copied to your clipboard.`,
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
                {meta.label}
              </Badge>
              <CardTitle className="text-base leading-snug line-clamp-2">
                <Link to={href} className="hover:text-primary transition-colors">
                  {title}
                </Link>
              </CardTitle>
            </div>
          </div>
          {item.tier === "pro" && <Badge variant="secondary">Pro</Badge>}
        </div>
        {item.summary && (
          <CardDescription className="pt-2 line-clamp-3">
            {item.summary}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.category && <span>{item.category}</span>}
          {item.readingTime && <span>{item.readingTime} min read</span>}
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
