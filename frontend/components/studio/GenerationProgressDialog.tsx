// GenerationProgressDialog — modal shown while the storyboard generator is
// running. Replaces the prior silent UX where the user clicked Next and saw
// no feedback until the Storyboard tab populated. Self-gated by the parent's
// status prop so callers don't need to remember to mount/unmount it.

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { StudioStatus } from "@/types/studio";

interface Props {
  status: StudioStatus;
}

export default function GenerationProgressDialog({ status }: Props) {
  const open = status === "generating";
  return (
    <Dialog open={open}>
      <DialogContent
        // Hide the built-in close (X) — there's no abort path for a
        // generation in flight, so showing a close button that does nothing
        // would be misleading. Selector targets the absolute-positioned
        // <Close> rendered inside DialogContent.
        className="sm:max-w-sm [&>button.absolute]:hidden"
        // Modal blocks interaction until the API call finishes — escape /
        // outside-click would just close the visual without aborting the
        // request, which would be more confusing than helpful.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" aria-hidden="true" />
          <div className="text-sm font-semibold">Generating your storyboard</div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Reading your inputs and drafting the scenes. This usually takes
            10–20 seconds.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
