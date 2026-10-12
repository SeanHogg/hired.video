/**
 * KitStoryPanel — a kit's five scenes (on/off, open one, jump to its source
 * on the page), wired to the kit. Shown as the Scenes tool on the video page
 * and beside the résumé at the stages that plan the video.
 */
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import StoryPanel from "@/components/build/StoryPanel";

export default function KitStoryPanel({ kit }: { kit: KitWorkspace }) {
  const { video, nav } = kit;
  return (
    <StoryPanel
      plan={video.plan}
      themeId={video.outline?.theme?.id ?? null}
      onToggle={(id, on) => video.patchScene(id, { off: on ? undefined : true })}
      onOpenScene={nav.openScene}
      onEditSource={nav.editFromPage}
    />
  );
}
