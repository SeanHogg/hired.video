import { useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { useBreadcrumbs, usePageChrome } from "@/lib/seo";
import { useUgcSeo, blogPostHeroImageUrl } from "@/lib/seo-ugc";
import MarketingFAQ from "@/components/MarketingFAQ";
import { getPublishedBlogPost, relatedBlogPosts } from "@/lib/content/published-blog-posts";
import BlogStudioTemplateRow from "@/components/blog/BlogStudioTemplateRow";
import {
  BlogPeoplePreviews,
  BlogTemplatePreviews,
  BlogVideoPreviews,
} from "@/components/blog/BlogInlinePreviews";
import { AppShell } from "@/components/AppShell";
import Markdown from "@/components/Markdown";
import TextNarrator from "@/components/audio/TextNarrator";
import {
  ReadingBackLink,
  ReadingCtaCard,
  ReadingHeader,
  RelatedContentGrid,
} from "@/components/content/ReadingLayout";
import { PROSE_CLASS, READING_COLUMN } from "@/components/content/content-ui";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { textFromFAQ } from "@/lib/audio/narrator-text";
import { articleCategoryI18nKey } from "@/lib/article-category";
import { formatContentDate, wasUpdated } from "@/lib/content/reading-meta";
import { cn } from "@/lib/utils";

export default function BlogPost() {
  usePageChrome();
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  // Gated accessor: hiring-audience posts resolve to undefined while the
  // hiring personas are off → the existing <Navigate to="/blog"> path below.
  const post = slug ? getPublishedBlogPost(slug) : undefined;

  // SEO — single adapter call. Builder lives in lib/seo-ugc.ts
  // ("blogPost" kind) and emits title/description/keywords plus the
  // BlogPosting JSON-LD via generateStructuredData.article. The adapter
  // resolves the hero image through `blogPostHeroImageUrl`, which falls
  // back to the per-post generated SVG card at `/api/og/blog` (see
  // api/src/routes/og.ts) when the post ships no real image — so every
  // post gets a per-post share card AND the on-page hero below.
  const blogSeoRecord = useMemo(() => {
    if (!post) return null;
    return {
      title: post.title,
      slug: post.slug,
      description: post.description,
      keywords: post.keywords,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      category: post.category,
      heroImageUrl: post.heroImageUrl,
      author: post.author,
      wordCount: post.sections.reduce((n, s) => n + s.body.split(/\s+/).length, 0),
    };
  }, [post]);
  useUgcSeo("blogPost", blogSeoRecord);

  // Same SSoT helper drives the visible in-page graphic (absolute URL,
  // real art when supplied, branded generated card otherwise).
  const heroImageUrl = useMemo(
    () => (post ? blogPostHeroImageUrl(post) : null),
    [post],
  );

  useBreadcrumbs(
    post
      ? [
          { name: t("labels.blog"), url: "/blog" },
          { name: post.title, url: `/blog/${post.slug}` },
        ]
      : [{ name: t("labels.blog"), url: "/blog" }],
  );

  // Related posts (same category, excluding current)
  const related = useMemo(() => {
    if (!post) return [];
    return relatedBlogPosts(post, 2);
  }, [post]);

  // Flatten the post into a single narratable string: lead, every
  // section heading + body, then the FAQ. TextNarrator strips markdown
  // before speaking, so the raw bodies are fine to pass through.
  const narrationText = useMemo(() => {
    if (!post) return "";
    const sectionBlock = post.sections
      .map((s) => `${s.heading}. ${s.body}`)
      .join("\n\n");
    return [post.description, sectionBlock, textFromFAQ(post.faq)]
      .filter(Boolean)
      .join("\n\n");
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  const categoryLabel = t(articleCategoryI18nKey(post.category), { defaultValue: post.category });
  const updated = wasUpdated(post.publishedAt, post.updatedAt)
    ? `${t("labels.updated")} ${formatContentDate(post.updatedAt, i18n.language, "short")}`
    : null;

  return (
    <AppShell bgClassName="bg-background">
      <article className={cn(READING_COLUMN, "flex flex-col gap-8 pb-[72px] pt-6")}>
        <ReadingBackLink to="/blog">{t("blog.post.allGuides")}</ReadingBackLink>

        <ReadingHeader
          eyebrow={categoryLabel}
          title={post.title}
          lede={post.description}
          meta={[
            formatContentDate(post.publishedAt, i18n.language, "long"),
            t("contentCard.minRead", { count: post.readingTime }),
            updated,
          ]}
        >
          {/* Listen-to-this-article pill. Self-gates: returns null when
              Web Speech is unavailable or the body is empty. */}
          <TextNarrator
            text={narrationText}
            preferenceKey={`blog.${post.slug}`}
            label={t("articleView.listenLabel")}
          />
        </ReadingHeader>

        {/* Hero graphic — real art when the post supplies `heroImageUrl`,
            otherwise the per-post branded card generated at /api/og/blog.
            `heroAlt` is the content-aligned description authored per post. */}
        {heroImageUrl && (
          <img
            src={heroImageUrl}
            alt={post.heroAlt}
            className="aspect-[1200/630] w-full rounded-[20px] border border-border object-cover"
            loading="eager"
          />
        )}

        <div>
          <BlogPeoplePreviews ids={post.previewPersonIds} />
          <BlogVideoPreviews ids={post.previewVideoIds} />
          <BlogTemplatePreviews ids={post.previewTemplateIds} />
          {/* Inline Studio template previews — self-gating. */}
          <BlogStudioTemplateRow files={post.studioTemplateFiles} />

          <div className="flex flex-col gap-10">
            {post.sections.map((section, i) => (
              <section key={i} className="flex flex-col gap-3">
                <h2 className="font-display text-[clamp(24px,2.6vw,30px)] font-bold tracking-[-0.025em] text-foreground">
                  {section.heading}
                </h2>
                <Markdown className={PROSE_CLASS}>{section.body}</Markdown>
              </section>
            ))}
          </div>
        </div>

        {/* CTA — try the tool */}
        <ReadingCtaCard
          title={t("blog.post.ctaTitle", { tool: post.toolName })}
          body={t("blog.post.ctaBody")}
          action={
            <Link to={post.toolUrl} className={HERO_CTA_PRIMARY}>
              {t("blog.post.ctaAction", { tool: post.toolName })}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />

        {post.faq.length > 0 && (
          <MarketingFAQ
            variant="plain"
            schemaId={`blog-${post.slug}`}
            items={post.faq}
            className="w-full"
          />
        )}

        <RelatedContentGrid
          title={t("blog.post.related")}
          items={related.map((r) => ({
            href: `/blog/${r.slug}`,
            title: r.title,
            description: r.description,
            chip: t(articleCategoryI18nKey(r.category), { defaultValue: r.category }),
            meta: t("contentCard.minRead", { count: r.readingTime }),
          }))}
        />
      </article>
    </AppShell>
  );
}
