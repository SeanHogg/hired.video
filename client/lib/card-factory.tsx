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

import {
  normalizeJobData,
  normalizeCompanyData,
  normalizePersonData,
  normalizeResumeData,
  normalizeVideoData,
  getCardType
} from "@/lib/card-normalizers";

import type {
  RawApiItem,
  CardContext,
  CardInteractions,
  NormalizedCardData,
  UserContext
} from "@/types/normalized-cards";

import {
  determineItemOwnership,
  getDefaultUserContext
} from "@/lib/user-context";

import {
  generateJobActions,
  generateCompanyActions,
  generateResumeActions,
  type DynamicCardAction
} from "@/lib/dynamic-actions";

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
  interactions = {}
}: UseCardRendererProps) {
  const effectiveUserContext = userContext || getDefaultUserContext();

  const context: CardContext = React.useMemo(() => ({
    section,
    userContext: effectiveUserContext,
    showOwnership,
    maxItems,
    interactions
  }), [section, effectiveUserContext, showOwnership, maxItems, interactions]);

  // eslint-disable-next-line no-unused-vars
  const renderCard = React.useCallback((item: RawApiItem, _index: number) => {
    const cardType = getCardType(item);
    let normalizedData: NormalizedCardData;

    // Normalize data based on card type
    switch (cardType) {
      case "job":
        normalizedData = normalizeJobData(item, context);
        const jobOwnership = determineItemOwnership(normalizedData, effectiveUserContext);
        const jobActions = generateJobActions(normalizedData, effectiveUserContext, jobOwnership, interactions);

        return (
          <JobCard
            key={normalizedData.id}
            job={normalizedData}
            actions={jobActions}
            userContext={effectiveUserContext}
            itemOwnership={jobOwnership}
            onView={() => interactions.onView?.(normalizedData)}
            onActions={() => interactions.onActions?.(normalizedData)}
            onTrack={interactions.onTrack}
            onUntrack={interactions.onUntrack}
          />
        );

      case "company":
        normalizedData = normalizeCompanyData(item, context);
        const companyOwnership = determineItemOwnership(normalizedData, effectiveUserContext);
        const companyActions = generateCompanyActions(normalizedData, effectiveUserContext, companyOwnership, interactions);

        return (
          <CompanyCard
            key={normalizedData.id}
            company={normalizedData}
            actions={companyActions}
            userContext={effectiveUserContext}
            itemOwnership={companyOwnership}
            onView={() => interactions.onView?.(normalizedData)}
            onActions={() => interactions.onActions?.(normalizedData)}
            onTrack={interactions.onTrack}
            onUntrack={interactions.onUntrack}
          />
        );

      case "people":
        normalizedData = normalizePersonData(item, context);
        return (
          <PeopleCard
            key={normalizedData.id}
            person={normalizedData}
            onView={() => interactions.onView?.(normalizedData)}
            onActions={() => interactions.onActions?.(normalizedData)}
            onTrack={interactions.onTrack}
            onUntrack={interactions.onUntrack}
          />
        );

      case "resume":
        normalizedData = normalizeResumeData(item, context);
        const resumeOwnership = determineItemOwnership(normalizedData, effectiveUserContext);
        const resumeActions = generateResumeActions(normalizedData, effectiveUserContext, resumeOwnership, interactions);

        return (
          <ResumeCard
            key={normalizedData.id}
            id={normalizedData.id}
            name={normalizedData.name}
            summary={normalizedData.summary}
            createdAt={normalizedData.createdAt}
            views={normalizedData.views || 0}
            privacy={normalizedData.privacy}
            actions={resumeActions}
            userContext={effectiveUserContext}
            itemOwnership={resumeOwnership}
            onView={() => interactions.onView?.(normalizedData)}
            onActions={() => interactions.onActions?.(normalizedData)}
          />
        );

      case "video":
        normalizedData = normalizeVideoData(item);
        return (
          <VideoCard
            key={normalizedData.id}
            video={normalizedData}
            onView={() => interactions.onView?.(normalizedData)}
            onActions={() => interactions.onActions?.(normalizedData)}
          />
        );

      default:
        // eslint-disable-next-line no-console
        console.warn(`Unknown card type for item:`, item);
        return null;
    }
  }, [context, interactions]);

  return renderCard;
}

/**
 * Direct card rendering function for non-hook usage
 */
export function renderCardItem(
  item: RawApiItem,
  context: CardContext,
  interactions: CardInteractions = {}
): React.ReactNode {
  const cardType = getCardType(item);
  let normalizedData: NormalizedCardData;

  switch (cardType) {
    case "job":
      normalizedData = normalizeJobData(item, context);
      return (
        <JobCard
          key={normalizedData.id}
          job={normalizedData}
          onView={interactions.onView}
          onActions={interactions.onActions}
          onTrack={interactions.onTrack}
          onUntrack={interactions.onUntrack}
        />
      );

    case "company":
      normalizedData = normalizeCompanyData(item, context);
      return (
        <CompanyCard
          key={normalizedData.id}
          company={normalizedData}
          onView={interactions.onView}
          onActions={interactions.onActions}
          onTrack={interactions.onTrack}
          onUntrack={interactions.onUntrack}
        />
      );

    case "people":
      normalizedData = normalizePersonData(item, context);
      return (
        <PeopleCard
          key={normalizedData.id}
          person={normalizedData}
          onView={interactions.onView}
          onActions={interactions.onActions}
          onTrack={interactions.onTrack}
          onUntrack={interactions.onUntrack}
        />
      );

    case "resume":
      normalizedData = normalizeResumeData(item, context);
      return (
        <ResumeCard
          key={normalizedData.id}
          id={normalizedData.id}
          name={normalizedData.name}
          summary={normalizedData.summary}
          createdAt={normalizedData.createdAt}
          views={normalizedData.views || 0}
          privacy={normalizedData.privacy}
          onView={interactions.onView}
          onActions={interactions.onActions}
        />
      );

    case "video":
      normalizedData = normalizeVideoData(item);
      return (
        <VideoCard
          key={normalizedData.id}
          video={normalizedData}
          onView={interactions.onView}
          onActions={interactions.onActions}
        />
      );

    default:
      // eslint-disable-next-line no-console
      console.warn(`Unknown card type for item:`, item);
      return null;
  }
}
