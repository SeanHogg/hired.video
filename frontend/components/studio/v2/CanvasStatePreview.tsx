/**
 * CanvasStatePreview — inline playback of a v2 canvas.
 *
 * Delegates to {@link TimelineFramePreview} so the public watch page
 * (`StudioVideoSurface`) and marketplace `TemplatePlayer` paint the same
 * export compositor frames as the editor overlay and the MP4 (#2392,
 * #742, #570). `CanvasStage` remains the editing surface.
 *
 * Prop-compatible with the previous DOM-stage wrapper: `state`,
 * `playback`, `className`, `ctaHotzones`, `analyticsProjectId`,
 * `projectId`. Branding is painted by the compositor (not a DOM overlay).
 */
export type { TimelineFramePreviewProps as CanvasStatePreviewProps } from "./TimelineFramePreview";
export { default } from "./TimelineFramePreview";
