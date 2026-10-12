/**
 * Full-screen loading shell used by every entry point into the studio
 * editor — code-split Suspense fallback, auth bootstrap, and the
 * project-load window before the persisted `mediaKind` is known.
 *
 * Per the DRY rule (`feedback_extract_on_duplication`): ONE component
 * owns the loading look so the studio never flashes the wrong chrome
 * before the runtime kind resolves. Previously the centered "Loading…"
 * markup was duplicated inline in Studio.tsx + StudioEditorV2.tsx's
 * `authLoading` branch, and the editor mounted the video chrome under
 * the wrong kind during the persisted-project load (300–800 ms),
 * causing a left-rail / right-rail repaint visible to the user when
 * opening image / game / animation projects via direct URL.
 */
interface StudioLoadingShellProps {
  /** Override the centered message. Defaults to "Loading…". */
  message?: string;
}

export default function StudioLoadingShell({
  message = "Loading…",
}: StudioLoadingShellProps = {}) {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
