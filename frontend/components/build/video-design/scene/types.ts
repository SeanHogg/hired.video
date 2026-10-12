/**
 * What every scene drill (a row of the scene inspector, Simple or Advanced)
 * receives: the selected scene, its plan, the colours it wears now, the
 * scene as it plays, the résumé its words come from, and the video (for
 * the whole-video settings: Voice, Format, Export). Scene edits go through
 * `onPatch` (one undo step per committed change; typing / dragging
 * coalesces by `group`); wording through `onContentChange`.
 */
import type { ResumeContent } from "@shared/resume";
import type { ScenePlan, VideoSceneId } from "@shared/video-plan";
import type { BuildVideo, ScenePatch } from "@/lib/build/use-build-video";
import type { SceneLook } from "@/lib/build/scene-palette";
import type { VideoOutlineScene } from "@/lib/build/video-outline";
import type { SceneCopy } from "@/lib/build/video-copy";

export interface SceneDrillProps {
  sceneId: VideoSceneId;
  /** The scene's plan (empty when the owner changed nothing). */
  scene: ScenePlan;
  /** The colours the scene wears now (look / theme / hand colours). */
  palette: SceneLook;
  onPatch: (patch: ScenePatch, group?: string) => void;
  video: BuildVideo;
  /** The scene as it plays — built switched on, so an off scene can still
   *  be inspected and switched back in — and its on-screen copy. */
  played: { scene: VideoOutlineScene; copy: SceneCopy };
  content: ResumeContent;
  onContentChange: (next: ResumeContent, group?: string) => void;
  onEditSource: (sectionKey: string) => void;
}
