import type * as React from "react";
import type { ResumeScores } from "@shared/scores";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import type { ResumePrivacy, ResumeWithOwnership } from "@/types/resume";

export type ResumeDownloadFormat = "pdf" | "word" | "json" | "text";

export interface ResumeCardProps {
  id: string;
  slug?: string;
  /** Resume owner's user id — used by EntityMedia to gate the Create
   *  Reel chip and by ownership-aware actions. Required for any surface
   *  that needs to distinguish owner from non-owner; safe to omit only
   *  when an explicit `ownership` prop is provided alongside. */
  userId?: string;
  name: string;
  title?: string;
  summary: string;
  createdAt: string;
  views?: number;
  /** Persisted analytical scores (overall/ats/keyword/format/content/impact)
   *  written by the resume scorer + optimizer. Owner-only — non-owners
   *  never see the score row. */
  scores?: ResumeScores | null;
  /** Sentiment score from the sentiment-analysis tool. Owner-only. */
  sentimentScore?: number | null;
  privacy?: "public" | "recruiter_only" | "connections" | "private" | "draft";
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string;
  parentName?: string;
  diffPercent?: number | null;
  // When this card represents a parent, its children are rendered as a
  // horizontal preview slider inside the card. Pass the full hydrated list
  // from the page so we can deep-link to each variant.
  variations?: ResumeWithOwnership[];
  ownership?: "owned" | "tracked";
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  onView?: () => void;
  /** @deprecated Use individual action handlers instead */
  onActions?: () => void;
  // Individual action handlers (consistent with list view)
  onEdit?: () => void;
  onRename?: () => void;
  onAddMedia?: () => void;
  onCreateVariation?: () => void;
  onSetActive?: () => void;
  onShare?: () => void;
  onCopyLink?: () => void;
  onShowQR?: () => void;
  onDownload?: (format: ResumeDownloadFormat) => void;
  onChangePrivacy?: (privacy: ResumePrivacy) => void;
  onPromoteToMaster?: () => void;
  onCopyToMaster?: () => void;
  /** Owner-only override for Clone. Defaults to calling
   *  `resumeService.cloneResume(id)` and navigating to the clone's edit
   *  page; most callers don't need to pass this. */
  onClone?: () => void;
  onDelete?: () => void;
  /** #154 — Archive flag + handlers. Defaults to not-archived. */
  isArchived?: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  /** #155 — Open version history dialog. */
  onViewVersionHistory?: () => void;
  onTrack?: () => void;
  onContactOwner?: () => void;
  onViewToolHistory?: () => void;
  /** Fired when a score chip is clicked. Receives the catalog tool
   *  id(s) that produced the score (e.g. `["ai-resume-scorer"]` or
   *  `["ai-resume-scorer", "resume-optimizer"]` for the ATS chip,
   *  since both write that sub-score), so the host can open the
   *  tool-history sheet pre-expanded on every matching tool. Optional
   *  — when omitted the chips render as non-interactive. */
  onScoreClick?: (toolIds: readonly string[]) => void;
  onViewAnalytics?: () => void;
  /** Extra dropdown items appended to the card's overflow menu (e.g. AddToListMenu). */
  extraMenuItems?: React.ReactNode;
}
