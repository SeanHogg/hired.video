import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Card, CardContent } from "@/components/ui/card";
import { TOOL_EXTRAS } from "@/data/tool-extras";
import { canonicalizePath } from "@/lib/seo";

/**
 * Renders FAQ (with FAQPage JSON-LD) + related blog post link at the
 * bottom of a tool page. Looks up the current route in TOOL_EXTRAS.
 *
 * Drop-in: just add <ToolFooterSEO /> before the Footer in any tool page.
 */
export default function ToolFooterSEO() {
  const { pathname } = useLocation();
  // Canonicalize so legacy /Tools/PascalCase URLs (still live for SEO
  // history) hit the same lowercase key as /tools/kebab-case. Without
  // this the FAQ + related-blog footer silently vanishes on any
  // PascalCase variant the user lands on.
  const key = canonicalizePath(pathname.replace(/\/+$/, ""));
  const extras = TOOL_EXTRAS[key];
  if (!extras) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 mb-8">
      {/* Related blog post */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="p-5 flex items-center gap-4">
          <BookOpen className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-0.5">
              Learn more in our guide
            </p>
            <Link
              to={`/blog/${extras.blogSlug}`}
              className="font-semibold hover:text-primary transition-colors line-clamp-1"
            >
              {extras.blogTitle}
            </Link>
          </div>
          <Link
            to={`/blog/${extras.blogSlug}`}
            className="text-primary shrink-0"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
        </CardContent>
      </Card>

      {/* FAQ with FAQPage JSON-LD */}
      <MarketingFAQ
        schemaId={extras.faqSchemaId}
        heading="Frequently Asked Questions"
        items={extras.faq}
        className="py-8"
      />
    </div>
  );
}
