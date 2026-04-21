import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ArrowRight,
  User,
  Briefcase,
  Building2,
  Sparkles,
  Mic,
  Newspaper,
  BookOpen,
  Wrench,
  HelpCircle,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchCardFeed, type CardFeedType, type SortableCard } from "@/lib/card-feed";

// DiscoverPreview is the homepage's window into the unified /search experience.
// It surfaces every content type the search indexes — resumes, jobs, companies,
// people, templates, articles, guides, tools, FAQs — through a single search
// input and a pill-based category switcher. Every interaction (search submit,
// chip click, card click, See all) lands the user on /search with the right
// query/category pre-applied, so the homepage is a discovery shortcut rather
// than a parallel search surface.

const CHIPS: { id: string; label: string; icon: typeof FileText; types: CardFeedType[] }[] = [
  { id: "all", label: "Featured", icon: Sparkles, types: ["resume", "job", "company", "people", "template", "article", "guide", "tool", "faq"] },
  { id: "people", label: "Profiles", icon: User, types: ["people"] },
  { id: "resumes", label: "Resumes", icon: FileText, types: ["resume"] },
  { id: "jobs", label: "Jobs", icon: Briefcase, types: ["job"] },
  { id: "companies", label: "Companies", icon: Building2, types: ["company"] },
  { id: "templates", label: "Templates", icon: Sparkles, types: ["template"] },
  { id: "voices", label: "Voices", icon: Mic, types: ["template"] },
  { id: "articles", label: "Articles", icon: Newspaper, types: ["article"] },
  { id: "guides", label: "Guides", icon: BookOpen, types: ["guide"] },
  { id: "tools", label: "Tools", icon: Wrench, types: ["tool"] },
  { id: "faqs", label: "FAQs", icon: HelpCircle, types: ["faq"] },
];

const ICON_BY_TYPE: Record<string, typeof FileText> = {
  resume: FileText,
  job: Briefcase,
  company: Building2,
  people: User,
  template: Sparkles,
  article: Newspaper,
  guide: BookOpen,
  tool: Wrench,
  faq: HelpCircle,
};

interface DiscoverPreviewProps {
  heading?: string;
  subheading?: string;
  className?: string;
  /** Max cards to show in the preview rail. */
  maxItems?: number;
}

export default function DiscoverPreview({
  heading = "Discover everything on hired.video",
  subheading = "Search resumes, jobs, companies, templates, articles, guides, tools and FAQs — all in one place.",
  className = "",
  maxItems = 6,
}: DiscoverPreviewProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState("all");
  const [items, setItems] = useState<SortableCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const chip = CHIPS.find((c) => c.id === activeChip) ?? CHIPS[0];
    setLoading(true);
    fetchCardFeed({
      types: chip.types,
      limitPerType: Math.max(1, Math.ceil(maxItems / Math.max(1, chip.types.length))),
      sort: "recent",
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items.slice(0, maxItems));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChip, maxItems]);

  const submit = () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (activeChip !== "all") params.set("category", activeChip);
    const qs = params.toString();
    navigate(qs ? `/search?${qs}` : "/search");
  };

  const goToChip = (chipId: string) => {
    setActiveChip(chipId);
  };

  return (
    <section className={className}>
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">{heading}</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">{subheading}</p>
      </div>

      <div className="relative max-w-2xl mx-auto mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Search everything — people, jobs, resumes, companies, articles..."
          className="pl-9 pr-24 h-11"
          aria-label="Search hired.video"
        />
        <Button
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={submit}
        >
          Search
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {CHIPS.map((chip) => {
          const Icon = chip.icon;
          const active = chip.id === activeChip;
          return (
            <Button
              key={chip.id}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => goToChip(chip.id)}
              className="gap-1.5"
            >
              <Icon className="h-3.5 w-3.5" />
              {chip.label}
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading &&
          Array.from({ length: Math.min(6, maxItems) }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        {!loading && items.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-8">
            Nothing to preview yet — try another category.
          </div>
        )}
        {!loading &&
          items.map((item) => {
            const Icon = ICON_BY_TYPE[item.type] ?? Sparkles;
            const href = hrefForItem(item);
            return (
              <Link
                key={`${item.type}-${item.id}`}
                to={href}
                className="block"
              >
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 p-2 flex-shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Badge variant="outline" className="mb-1 capitalize">
                        {item.type}
                      </Badge>
                      <div className="font-semibold text-sm line-clamp-1">
                        {item.title ?? item.name ?? ""}
                      </div>
                      {item.summary && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {item.summary}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
      </div>

      <div className="text-center mt-6">
        <Link to={activeChip === "all" ? "/search" : `/search?category=${activeChip}`}>
          <Button variant="ghost" className="gap-1">
            See all results in search
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

function hrefForItem(item: SortableCard): string {
  const t = item.type;
  if (t === "resume") return `/resumes/${item.id}`;
  if (t === "job") return `/jobs/${item.id}`;
  if (t === "company") return `/companies/${item.id}`;
  if (t === "people") return `/people/${(item as any).slug || item.id}`;
  if ((item as any).href) return (item as any).href;
  return "/search";
}
