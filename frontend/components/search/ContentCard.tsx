import { Link } from "react-router-dom";
import { Newspaper, BookOpen, HelpCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
}

const TYPE_META = {
  article: { icon: Newspaper, label: "Article", cta: "Read article" },
  guide: { icon: BookOpen, label: "Guide", cta: "Open guide" },
  faq: { icon: HelpCircle, label: "FAQ", cta: "See answer" },
} as const;

export default function ContentCard({ item }: { item: ContentItem }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const title = item.title ?? item.name ?? "";
  const href = item.href ?? "#";

  return (
    <Card className="flex flex-col h-full">
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
                {title}
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
        <Link to={href}>
          <Button variant="secondary" className="w-full">
            {meta.cta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
