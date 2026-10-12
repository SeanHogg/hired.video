/**
 * Which workspace a URL opens — ONE rule for every way in:
 *
 *   /studio/new                    a new career kit
 *   /studio/new?contentTemplate=…  a studio format seeded from a template
 *     (also ?template= / ?studioTemplate= / ?subject= / ?capture= / ?new=1 /
 *      ?claim=1) — except a template whose output IS the kit (career-starts)
 *   /studio/resume/<resumeId>      that résumé's kit (its project is found or
 *                                  made in the workspace, then the URL becomes
 *                                  /studio/<projectId>)
 *   /studio/<projectId>            load the project: a kit when it carries a
 *                                  `resume_video` subject, else its format.
 *                                  A hand-off (router state `kit`, or
 *                                  `studio` from a format's first save)
 *                                  skips the load so the workspace stays
 *                                  mounted.
 *
 * Pure so the route component and the tests agree.
 */
import { isWorkspaceTemplate } from "@/lib/studio/career-starts";

export const STUDIO_NEW_ID = "new";
export const KIT_RESUME_PATH = "/studio/resume";

/** Router state a kit carries onto /studio/<projectId>. */
export interface KitRouteState {
  kit: { projectId: string; resumeId: string | null };
}

/** Router state a studio format carries onto /studio/<projectId> once its
 *  first save mints the row (it already holds the project). */
export interface StudioRouteState {
  studio: { projectId: string };
}

export function studioRouteState(projectId: string): StudioRouteState {
  return { studio: { projectId } };
}

export type WorkspaceRoute =
  | { kind: "kit"; projectId: string | null; resumeId: string | null }
  | { kind: "studio" }
  | { kind: "load"; projectId: string };

/** Params that make /studio/new a studio format rather than a kit. */
const STUDIO_START_PARAMS = ["template", "studioTemplate", "subject", "capture", "new", "claim"] as const;

export function kitResumePath(resumeId: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return `${KIT_RESUME_PATH}/${encodeURIComponent(resumeId)}${query ? `?${query}` : ""}`;
}

function isKitState(state: unknown, projectId: string): state is KitRouteState {
  if (typeof state !== "object" || state === null) return false;
  const kit = (state as { kit?: unknown }).kit;
  return typeof kit === "object" && kit !== null && (kit as { projectId?: unknown }).projectId === projectId;
}

function isStudioState(state: unknown, projectId: string): boolean {
  if (typeof state !== "object" || state === null) return false;
  const studio = (state as { studio?: unknown }).studio;
  return typeof studio === "object" && studio !== null && (studio as { projectId?: unknown }).projectId === projectId;
}

interface RouteInput {
  /** `:id` of /studio/:id. */
  projectId?: string;
  /** `:resumeId` of /studio/resume/:resumeId. */
  resumeId?: string;
  params: URLSearchParams;
  state: unknown;
}

export function resolveWorkspaceRoute({ projectId, resumeId, params, state }: RouteInput): WorkspaceRoute {
  if (resumeId) return { kind: "kit", projectId: null, resumeId };
  if (!projectId || projectId === STUDIO_NEW_ID) {
    // A kit template starts a kit, not a format.
    const template = params.get("contentTemplate") ?? params.get("template");
    if (isWorkspaceTemplate(template)) {
      return { kind: "kit", projectId: null, resumeId: null };
    }
    const studioStart = params.has("contentTemplate") || STUDIO_START_PARAMS.some((p) => params.has(p));
    return studioStart ? { kind: "studio" } : { kind: "kit", projectId: null, resumeId: null };
  }
  if (isKitState(state, projectId)) {
    return { kind: "kit", projectId, resumeId: state.kit.resumeId };
  }
  if (isStudioState(state, projectId)) return { kind: "studio" };
  return { kind: "load", projectId };
}
