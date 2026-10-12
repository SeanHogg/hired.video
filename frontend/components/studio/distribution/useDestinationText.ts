/**
 * useDestinationText — each destination's own caption and title in the
 * Distribution Hub (#2047, PRD §4.2). The shared caption is the default;
 * a destination may override its caption, and its title where the network
 * shows one. Limits are each network's own (shared/social-publish-jobs:
 * `captionLimitFor`, `titleLimitFor`) — the same checks the API runs.
 */
import { useCallback, useState } from "react";
import {
  captionLimitFor,
  postTextProblem,
  titleLimitFor,
  type DistributionDestination,
  type DistributionLane,
} from "@shared/social-publish-jobs";

export interface DestinationRef {
  destination: DistributionDestination;
  lane: DistributionLane;
}

interface Override {
  caption?: string;
  title?: string;
}

export const destinationKey = (d: DestinationRef) => `${d.destination}:${d.lane}`;

/** Pure: the text a destination sends, and what (if anything) is wrong with it. */
export function destinationText(d: DestinationRef, shared: string, override: Override | undefined) {
  const caption = override?.caption ?? shared;
  const title = override?.title ?? "";
  return {
    caption,
    title,
    overridden: override?.caption !== undefined,
    captionLimit: captionLimitFor(d.destination),
    titleLimit: titleLimitFor(d.destination, d.lane),
    problem: postTextProblem(d.destination, d.lane, { caption: caption.trim(), title: title.trim() || null }),
  };
}

export function useDestinationText() {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const patch = useCallback((d: DestinationRef, next: Override) => {
    setOverrides((prev) => ({ ...prev, [destinationKey(d)]: { ...prev[destinationKey(d)], ...next } }));
  }, []);

  return {
    textFor: (d: DestinationRef, shared: string) => destinationText(d, shared, overrides[destinationKey(d)]),
    setCaption: (d: DestinationRef, caption: string | undefined) => patch(d, { caption }),
    setTitle: (d: DestinationRef, title: string) => patch(d, { title }),
    reset: () => setOverrides({}),
  };
}

export type DestinationTextState = ReturnType<typeof useDestinationText>;
