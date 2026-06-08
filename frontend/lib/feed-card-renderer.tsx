/**
 * Shared heterogeneous card renderer.
 *
 * Single source of truth for "given a `RawApiItem`-shaped result of any
 * type, render the right card." Both the /search results grid
 * (UnifiedSearch) and the curated dashboard feed (DashboardFeed) drive
 * their grids through this hook so the type → card mapping lives in exactly
 * one place (DRY rule).
 *
 * Dispatch order mirrors the previous inline switch in UnifiedSearch:
 *   voice / service / course / template / tool / article|guide|faq → their
 *   dedicated cards; `page` (and any href-only item) → the generic
 *   <FeaturedLinkCard>; everything else → the card factory
 *   (job / company / people / resume / video / media / event).
 */
import * as React from "react";
import VoiceMarketplaceCard from "@/components/VoiceMarketplaceCard";
import ServiceMarketplaceCard, {
  type ServiceMarketplaceItem,
} from "@/components/ServiceMarketplaceCard";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import TemplateCard from "@/components/resume-renderer/TemplateCard";
import ContentCard from "@/components/search/ContentCard";
import { ToolCard } from "@/components/ToolCard";
import { FeaturedLinkCard } from "@/components/dashboard/FeaturedLinkCard";
import { getCatalogTool } from "@/data/tools-catalog";
import { useCardRenderer } from "@/lib/card-factory";
import { createUserContext, getDefaultUserContext } from "@/lib/user-context";
import { useAuth } from "@/lib/auth";

export interface FeedCardRendererOptions {
  onView?: (item: any) => void;
  onActions?: (item: any) => void;
}

/**
 * Map a heterogeneous result to its detail-page route. Shared by the
 * /search card "View" + list hyperlink AND the dashboard feed's onView so
 * the two can never drift. Returns null when a result has no concrete
 * destination (the caller then leaves the card's own link to handle it).
 */
export function feedEntityHref(item: any): string | null {
  switch (item.type) {
    case "resume":
      return `/resumes/${item.id}`;
    case "job":
      return `/jobs/${item.id}`;
    case "company":
      return `/companies/${item.id}`;
    case "people":
      return `/people/${item.slug || item.id}`;
    case "video":
      return `/v/${item.id}`;
    case "voice":
      return item.voiceCloneId
        ? `/marketplace/voices/${item.voiceCloneId}`
        : null;
    case "service":
      return item.isPlatformService
        ? "/services?wizard=open"
        : `/people/${item.providerSlug || item.provider?.id}?tab=services`;
    case "course":
      return item.author?.slug && item.slug
        ? `/courses/${item.author.slug}/${item.slug}`
        : null;
    case "template": {
      const slug = item.meta?.slug || item.descriptor?.id;
      return slug ? `/marketplace/templates/${slug}` : null;
    }
    case "tool":
      return getCatalogTool(item.id)?.href ?? item.href ?? null;
    default:
      // article / guide / faq / page and any future kind carry their own href.
      return (item.href as string) ?? null;
  }
}

/** Normalise the various upstream cover-image keys onto the single `image`
 *  prop <FeaturedLinkCard> reads. */
function coverImage(item: any): string | undefined {
  return (
    item.image ||
    item.coverImageUrl ||
    item.thumbnail ||
    item.thumbnailUrl ||
    undefined
  );
}

export function useFeedCardRenderer(
  { onView, onActions }: FeedCardRendererOptions = {},
): (item: any, index: number) => React.ReactNode {
  const { user } = useAuth();

  const userContext = user
    ? createUserContext({
        userId: user.id,
        role: user.role || "regular_user",
        accountId: (user as any).accountId,
        permissions: (user as any).permissions || [],
      })
    : getDefaultUserContext();

  const factoryRenderer = useCardRenderer({
    section: "all",
    userContext,
    showOwnership: false,
    interactions: { onView, onActions },
  });

  return React.useCallback(
    (item: any, index: number): React.ReactNode => {
      if (item.type === "voice") {
        return <VoiceMarketplaceCard key={item.id} item={item as any} />;
      }
      if (item.type === "service") {
        return (
          <ServiceMarketplaceCard
            key={item.id}
            item={item as ServiceMarketplaceItem}
          />
        );
      }
      if (item.type === "course") {
        return (
          <CourseMarketplaceCard
            key={item.id}
            item={item as CourseMarketplaceItem}
          />
        );
      }
      if (item.type === "template" && (item.meta || item.descriptor)) {
        return (
          <TemplateCard
            key={item.id}
            meta={item.meta}
            descriptor={item.descriptor}
          />
        );
      }
      if (item.type === "tool") {
        const catalogEntry = getCatalogTool(item.id);
        if (catalogEntry) {
          return <ToolCard key={item.id} tool={catalogEntry} />;
        }
        // Curated tool whose catalog entry was removed — fall back to the
        // generic link card using the snapshot so it still renders.
        return (
          <FeaturedLinkCard
            key={item.id}
            item={{ ...item, image: coverImage(item) }}
          />
        );
      }
      if (
        item.type === "article" ||
        item.type === "guide" ||
        item.type === "faq"
      ) {
        return <ContentCard key={item.id} item={item as any} />;
      }
      // Pinned pages / custom links have no first-class card.
      if (item.type === "page") {
        return (
          <FeaturedLinkCard
            key={item.id}
            item={{ ...item, image: coverImage(item) }}
          />
        );
      }
      return factoryRenderer(item, index);
    },
    [factoryRenderer, onView, onActions],
  );
}
