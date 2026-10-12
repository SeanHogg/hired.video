/**
 * InlineBodyMessage — single source of truth for the loading / error /
 * empty captions every linked-content inline body renders. Per the DRY
 * rule: every per-kind body uses THIS component for its non-content
 * states so the chrome stays consistent (font, alignment, muted
 * colour) across resume / job / article / profile / company / video.
 */
export function InlineBodyMessage({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-white text-[11px] text-muted-foreground">
      {label}
    </div>
  );
}
