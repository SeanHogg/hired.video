/**
 * Card action type — the action-as-data shape consumed by `CardActions` and
 * the legacy `fallbackActions` arrays on PeopleCard / CompanyCard /
 * ResumeCard / VideoCard / ContentCard / MediaCard.
 *
 * Authorship of the action list itself now lives inside each card's own
 * native menu (`JobActionsMenu`, `ResumeActionsMenu`, the card's local
 * `fallbackActions` cluster). The previous `generateJobActions` /
 * `generateCompanyActions` / `generateResumeActions` factories here shipped
 * stub Pause / Clone / Analytics items with `console.log` handlers and
 * never rendered Share — they're deleted with the share-affordance pass.
 */

import type { SharePayload } from "@shared/social-share";

export interface DynamicCardAction {
  id: string;
  label: string;
  /**
   * When set, renderers that support it (CardActions) surface this action as
   * the full social ShareMenu (LinkedIn / X / … / copy link / native) instead
   * of a plain button. `onClick` stays the copy-link fallback for renderers
   * that don't special-case share (ActionsModal, QuickActions).
   */
  share?: SharePayload;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  icon?: React.ComponentType<{ className?: string }>;

  onClick: (event: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  requiresConfirmation?: boolean;
  priority?: number;
}
