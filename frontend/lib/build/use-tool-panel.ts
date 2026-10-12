/**
 * Which stage tool is open in the kit's slide-out, and on which résumé. A
 * tool works on a saved row, so opening one saves the draft first (a
 * signed-out visitor's goes to their guest account); if that fails the
 * header's save status already says so and the panel stays shut.
 */
import { useCallback, useState } from "react";

export interface OpenTool {
  toolId: string;
  resumeId: string;
}

export function useToolPanel(ensureSaved: () => Promise<string>) {
  const [open, setOpen] = useState<OpenTool | null>(null);
  const show = useCallback(
    async (toolId: string) => {
      try {
        setOpen({ toolId, resumeId: await ensureSaved() });
      } catch {
        // Shown by the save status.
      }
    },
    [ensureSaved],
  );
  const close = useCallback(() => setOpen(null), []);
  return { open, show, close };
}
