import { useEffect, useMemo } from "react";
import { useParams, useLocation, Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { getBlogPost, BLOG_POSTS } from "@/data/blog-posts";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } =
    useSidebar();

  const post = slug ? getBlogPost(slug) : undefined;

  // SEO — dynamic per post
  useSEO(location.pathname, post ? {
    title: `${post.title} | hired.video`,
    description: post.description,
    keywords: post.keywords,
    ogTitle: post.title,
    ogDescription: post.description,
  } : undefined);

  useBreadcrumbs(
    post
      ? [
          { name: "Blog", url: "/blog" },
          { name: post.title, url: `/blog/${post.slug}` },
        ]
      : [{ name: "Blog", url: "/blog" }],
  );

  // Article + BlogPosting JSON-LD
  useEffect(() => {
    if (!post) return;
    const scriptId = "blog-article-jsonld";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: {
        "@type": "Organization",
        name: "hired.video",
        url: "https://hired.video",
      },
      publisher: {
        "@type": "Organization",
        name: "hired.video",
        url: "https://hired.video",
        logo: { "@type": "ImageObject", url: "https://hired.video/og-image.svg" },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `https://hired.video/blog/${post.slug}`,
      },
      wordCount: post.sections.reduce((n, s) => n + s.body.split(/\s+/).length, 0),
      keywords: post.keywords,
    });
    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [post]);

  // Related posts (same category, excluding current)
  const related = useMemo(() => {
    if (!post) return [];
    return BLOG_POSTS.filter((p) => p.slug !== post.slug && p.category === post.category).slice(0, 2);
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={closeSidebar}
      />
      <div className="flex-1 flex flex-col min-h-screen">
        <Navigation onMenuClick={openSidebar} />
        <article className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          {/* Back link */}
          <Link
            to="/blog"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> All guides
          </Link>

          {/* Meta line */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
            <Badge variant="secondary">{post.category}</Badge>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {post.readingTime} min read
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />{" "}
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {post.updatedAt !== post.publishedAt && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Updated{" "}
                {new Date(post.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">
            {post.title}
          </h1>

          {/* Lead */}
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            {post.description}
          </p>

          {/* Sections */}
          {post.sections.map((section, i) => (
            <section key={i} className="mb-8">
              <h2 className="text-2xl font-semibold mb-3">{section.heading}</h2>
              <div className="prose prose-gray dark:prose-invert max-w-none text-base leading-relaxed">
                {section.body.split("\n\n").map((para, j) => (
                  <p key={j} className="mb-4 whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}

          {/* CTA — try the tool */}
          <Card className="my-10 border-primary/30 bg-primary/5">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-lg mb-1">
                  Try the {post.toolName} — free, no signup
                </p>
                <p className="text-sm text-muted-foreground">
                  Put this guide into practice. Open the tool and see results in
                  under 60 seconds.
                </p>
              </div>
              <Button asChild size="lg">
                <Link to={post.toolUrl}>
                  Open {post.toolName} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* FAQ */}
          {post.faq.length > 0 && (
            <MarketingFAQ
              schemaId={`blog-${post.slug}`}
              heading="Frequently Asked Questions"
              items={post.faq}
              className="py-10"
            />
          )}

          {/* Related posts */}
          {related.length > 0 && (
            <section className="mt-10 mb-6">
              <h2 className="text-2xl font-semibold mb-4">Related Guides</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {related.map((r) => (
                  <Link key={r.slug} to={`/blog/${r.slug}`} className="group">
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <Badge variant="secondary" className="mb-2 text-xs">
                          {r.category}
                        </Badge>
                        <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-2">
                          {r.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {r.description}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
        <Footer />
      </div>
    </div>
  );
}
