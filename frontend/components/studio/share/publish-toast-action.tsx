/**
 * Renders a publish toast's action button (lib/studio/use-publish-handlers
 * describes it as data — the lib layer renders no UI). Every host of
 * `usePublishHandlers` / `useCanvasPublisher` passes this as
 * `renderToastAction`.
 */
import { ToastAction } from "@/components/ui/toast";
import type { PublishToastActionSpec } from "@/lib/studio/use-publish-handlers";

export function renderPublishToastAction({ altText, label, onClick }: PublishToastActionSpec) {
  return (
    <ToastAction altText={altText} onClick={onClick}>
      {label}
    </ToastAction>
  );
}
