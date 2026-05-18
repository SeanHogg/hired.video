/**
 * Card Factory - Central rendering system for all card types
 *
 * Provides a unified interface for rendering cards with proper React hooks usage,
 * eliminating the need for different rendering logic across sections.
 */

import * as React from "react";
import JobCard from "@/components/JobCard";
import CompanyCard from "@/components/CompanyCard";
import PeopleCard from "@/components/PeopleCard";
import ResumeCard from "@/components/ResumeCard";
import VideoCard from "@/components/VideoCard";
import MediaCard from "@/components/MediaCard";

import {
  normalizeJobData,
  normalizeCompanyData,
  normalizePersonData,
  normalizeResumeData,
  normalizeVideoData,
  normalizeMediaData,
  getCardType,
} from "@/lib/card-normalizers";

import type {
  RawApiItem,
  CardContext,
  CardInteractions,
  NormalizedCardData,
  UserContext,
} from "@/types/normalized-cards";

import {
  determineItemOwnership,
  getDefaultUserContext,
} from "@/lib/user-context";

// Action authorship lives inside each card's native menu (`JobActionsMenu`,
// `ResumeActionsMenu`, the `fallbackActions` cluster on CompanyCard /
// PeopleCard). Those menus self-gate on ownership + auth and include the
// platform-wide Share group. We deliberately don't synthesise an `actions`
// array here — the previous `generateJobActions` / `generateCompanyActions` /
// `generateResumeActions` helpers shipped stub Pause / Clone / Analytics
// items with `console.log` handlers and never rendered Share, so cards
// rendered through this factory surfaced unworkable owner actions and
// hid Share from every viewer. Deleted with this pass.

interface UseCardRendererProps {
  section: CardContext["section"];
  userContext?: UserContext;
  showOwnership?: boolean;
  maxItems?: number;
  interactions?: CardInteractions;
}

/**
 * Hook for creating card renderers with consistent normalization
 */
export function useCardRenderer({
  section,
  userContext,
  showOwnership = false,
  maxItems,
  interactions = {},
}: UseCardRendererProps) {
  const effectiveUserContext = userContext || getDefaultUserContext();

  const context: CardContext = React.useMemo(
    () => ({
      section,
      userContext: effectiveUserContext,
      showOwnership,
      maxItems,
      interactions,
    }),
    [section, effectiveUserContext, showOwnership, maxItems, interactions],
  );

   
  const renderCard = React.useCallback(
    (item: RawApiItem, _index: number) => {
      const cardType = getCardType(item);
      let normalizedData: NormalizedCardData;

      // Normalize data based on card type
      switch (cardType) {
        case "job": {
          normalizedData = normalizeJobData(item, context);
          const jobOwnership = determineItemOwnership(
            normalizedData,
            effectiveUserContext,
          );
          return (
            <JobCard
              key={normalizedData.id}
              job={normalizedData}
              userContext={effectiveUserContext}
              itemOwnership={jobOwnership}
              onView={() => interactions.onView?.(normalizedData)}
              onTrack={interactions.onTrack}
              onUntrack={interactions.onUntrack}
            />
          );
        }

        case "company": {
          normalizedData = normalizeCompanyData(item, context);
          const companyOwnership = determineItemOwnership(
            normalizedData,
            effectiveUserContext,
          );
          return (
            <CompanyCard
              key={normalizedData.id}
              company={normalizedData}
              userContext={effectiveUserContext}
              itemOwnership={companyOwnership}
              onView={() => interactions.onView?.(normalizedData)}
              onActions={() => interactions.onActions?.(normalizedData)}
              onTrack={interactions.onTrack}
              onUntrack={interactions.onUntrack}
            />
          );
        }

        case "people": {
          normalizedData = normalizePersonData(item, context);
          const peopleOwnership = determineItemOwnership(
            normalizedData,
            effectiveUserContext,
          );

          return (
            <PeopleCard
              key={normalizedData.id}
              person={normalizedData}
              userContext={effectiveUserContext}
              itemOwnership={peopleOwnership}
              onView={() => interactions.onView?.(normalizedData)}
              onTrack={interactions.onTrack}
              onUntrack={interactions.onUntrack}
            />
          );
        }

        case "resume": {
          normalizedData = normalizeResumeData(item, context);
          const resumeOwnership = determineItemOwnership(
            normalizedData,
            effectiveUserContext,
          );
          return (
            <ResumeCard
              key={normalizedData.id}
              id={normalizedData.id}
              userId={normalizedData.userId}
              name={normalizedData.name}
              summary={normalizedData.summary}
              createdAt={normalizedData.createdAt}
              views={normalizedData.views || 0}
              privacy={normalizedData.privacy}
              ownership={normalizedData.ownership}
              userContext={effectiveUserContext}
              itemOwnership={resumeOwnership}
              onView={() => interactions.onView?.(normalizedData)}
              onActions={() => interactions.onActions?.(normalizedData)}
            />
          );
        }

        case "video": {
          normalizedData = normalizeVideoData(item, context);

          return (
            <VideoCard
              key={normalizedData.id}
              id={normalizedData.id}
              title={normalizedData.title}
              description={normalizedData.description}
              thumbnail={normalizedData.thumbnail || ""}
              duration={normalizedData.duration}
              views={normalizedData.views}
              type={normalizedData.videoType}
              profession={normalizedData.profession}
              company={normalizedData.company}
              createdAt={normalizedData.createdAt}
              onView={() => interactions.onView?.(normalizedData)}
            />
          );
        }

        case "media": {
          const mediaData = normalizeMediaData(item, context);

          // Try to extract resume ID from the item data
          // Note: Currently the search API doesn't provide resume ID directly for media items
          // The referenceId points to a resume section, not the resume itself
          const resumeId = item.resumeId || item.ResumeId || item.resumeInformationEntityId || item.ResumeInformationEntityId;

          // For media items, also try to get the owner's user ID for fallback navigation
          const ownerId = item.ownerId || item.userId || mediaData.userId;

          // Convert normalized media data to MediaCard format
          const mediaCardData = {
            id: mediaData.id,
            userId: mediaData.userId || ownerId, // Use ownerId as fallback
            referenceId: mediaData.referenceId,
            name: mediaData.name,
            metaType: mediaData.metaType as any,
            url: mediaData.url,
            description: mediaData.description,
            createdAt: mediaData.createdAt,
          };





          return (
            <MediaCard
              key={mediaData.id}
              media={mediaCardData}
              resumeId={resumeId}
              onView={() => interactions.onView?.(mediaData)}
              onPlay={() => interactions.onView?.(mediaData)}
            />
          );
        }

        default:
          // eslint-disable-next-line no-console
          console.warn(`Unknown card type for item:`, item);
          return null;
      }
    },
    [context, interactions],
  );

  return renderCard;
}

/**
 * Direct card rendering function for non-hook usage
 */
export function renderCardItem(
  item: RawApiItem,
  context: CardContext,
  interactions: CardInteractions = {},
): React.ReactNode {
  const cardType = getCardType(item);
  let normalizedData: NormalizedCardData;

  switch (cardType) {
    case "job": {
      normalizedData = normalizeJobData(item, context);
      return (
        <JobCard
          key={normalizedData.id}
          job={normalizedData}
          onView={() => interactions.onView?.(normalizedData)}
          onTrack={interactions.onTrack}
          onUntrack={interactions.onUntrack}
        />
      );
    }

    case "company": {
      normalizedData = normalizeCompanyData(item, context);
      return (
        <CompanyCard
          key={normalizedData.id}
          company={normalizedData}
          onView={() => interactions.onView?.(normalizedData)}
          onTrack={interactions.onTrack}
          onUntrack={interactions.onUntrack}
        />
      );
    }

    case "people": {
      normalizedData = normalizePersonData(item, context);
      return (
        <PeopleCard
          key={normalizedData.id}
          person={normalizedData}
          onView={() => interactions.onView?.(normalizedData)}
          onTrack={interactions.onTrack}
          onUntrack={interactions.onUntrack}
        />
      );
    }

    case "resume": {
      normalizedData = normalizeResumeData(item, context);
      return (
        <ResumeCard
          key={normalizedData.id}
          id={normalizedData.id}
          userId={normalizedData.userId}
          name={normalizedData.name}
          summary={normalizedData.summary}
          createdAt={normalizedData.createdAt}
          views={normalizedData.views || 0}
          privacy={normalizedData.privacy}
          ownership={normalizedData.ownership}
          onView={() => interactions.onView?.(normalizedData)}
        />
      );
    }

    case "video": {
      normalizedData = normalizeVideoData(item, context);
      return (
        <VideoCard
          key={normalizedData.id}
          id={normalizedData.id}
          title={normalizedData.title}
          description={normalizedData.description}
          thumbnail={normalizedData.thumbnail || ""}
          duration={normalizedData.duration}
          views={normalizedData.views}
          type={normalizedData.videoType}
          profession={normalizedData.profession}
          company={normalizedData.company}
          createdAt={normalizedData.createdAt}
          onView={() => interactions.onView?.(normalizedData)}
        />
      );
    }

    case "media": {
      const mediaData = normalizeMediaData(item, context);
      // Convert normalized media data to MediaCard format
      const mediaCardData = {
        id: mediaData.id,
        userId: mediaData.userId,
        referenceId: mediaData.referenceId,
        name: mediaData.name,
        metaType: mediaData.metaType as any,
        url: mediaData.url,
        description: mediaData.description,
        createdAt: mediaData.createdAt,
      };

      // Try to extract resume ID from the item data
      // Note: Currently the search API doesn't provide resume ID directly for media items
      // The referenceId points to a resume section, not the resume itself
      const resumeId = item.resumeId || item.ResumeId || item.resumeInformationEntityId || item.ResumeInformationEntityId;

      return (
        <MediaCard
          key={mediaData.id}
          media={mediaCardData}
          resumeId={resumeId}
          onView={() => interactions.onView?.(mediaData)}
          onPlay={() => interactions.onView?.(mediaData)}
        />
      );

    }

    default:
      // eslint-disable-next-line no-console
      console.warn(`Unknown card type for item:`, item);
      return null;
  }
}
