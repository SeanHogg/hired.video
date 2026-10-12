/**
 * useGatedScreenshot — the palette's Screenshot tile, one way everywhere a
 * kit adds elements (the video frame, the résumé / letter pages): ask the
 * upload gate (a silent guest signs in first), pick a window, snapshot it,
 * upload it, then hand the hosted URL to the caller to place.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useScreenshotCapture } from "@/lib/studio/editor-v2/use-screenshot-capture";
import type { AnonGateValue } from "@/lib/studio/anon-gate-context";
import { useToast } from "@/hooks/use-toast";

export function useGatedScreenshot(uploadGate: AnonGateValue): (onImage: (url: string) => void) => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { capture } = useScreenshotCapture();

  return useCallback(
    (onImage: (url: string) => void) => {
      const run = async () => {
        const notice = toast({
          title: t("studio.editor.capturingScreenshot"),
          description: t("studio.editor.capturingScreenshotDesc"),
        });
        const url = await capture();
        notice.dismiss();
        if (url) onImage(url);
      };
      const allowed = uploadGate.requireAuth({
        reason: "upload",
        displayReason: t("build.frame.uploadGateReason"),
        onAuthed: () => void run(),
      });
      if (allowed) void run();
    },
    [toast, t, capture, uploadGate],
  );
}
