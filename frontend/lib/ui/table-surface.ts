/**
 * Shared list/table surface classes. A data table is a distinct CARD panel
 * (white/`bg-card` surface + soft border + shadow) so its rows read as a
 * contained list instead of loose text floating on the page canvas, with a
 * solid tinted header band. Every table across the app composes these two
 * constants so the treatment stays identical in one place (DRY).
 *
 * Usage:
 *   <div className={TABLE_SURFACE}>
 *     <table>
 *       <thead className={TABLE_HEAD}> … </thead>
 *       …
 */
export const TABLE_SURFACE =
  "overflow-x-auto rounded-xl border border-border bg-card shadow-sm";

export const TABLE_HEAD =
  "border-b border-border bg-muted text-xs text-muted-foreground";
