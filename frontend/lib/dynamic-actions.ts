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

export interface DynamicCardAction {
  id: string;
  label: string;
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
