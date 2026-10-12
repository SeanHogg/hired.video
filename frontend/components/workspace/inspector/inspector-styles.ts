/**
 * The ONE look every kit inspector shares (résumé "This line", the letter,
 * the video scene): the caption over a field or group, the panel padding,
 * the "back to the default" text button and the 44px icon button. Theme
 * tokens only, so light and dark both read.
 */

/** Caption over an inspector field or group ("THE LINE", "TONE", "FONT"). */
export const INSPECTOR_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** The body of an inspector panel in the right slot. */
export const INSPECTOR_PAD = "flex flex-col gap-4 p-4";

/** A "back to the default" text button (≥ 44px tall). */
export const INSPECTOR_RESET =
  "min-h-11 self-start text-[13px] font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline";

/** A square icon button (move up / down, remove) — a 44px tap target. */
export const INSPECTOR_ICON_BUTTON =
  "flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

/** A one-line help note under a drill's controls. */
export const INSPECTOR_HELP = "text-[13px] text-muted-foreground";
