/**
 * Every feature of the old résumé builder ("kit") and the studio editor,
 * and where it lives in the ONE workspace (the Spec board's table, as data). Nothing is retired: the
 * parity test (__tests__/components/workspace/workspace-parity.test.ts) fails when a feature names a home
 * the registry (workspace-panels.ts) doesn't have, or a home's depth
 * disagrees with the registry's — so moving or dropping a region can't
 * silently strand a feature. A feature the board designs but the code
 * doesn't have yet says so (`planned`: its ROADMAP gap) instead of claiming
 * a home.
 */
import type { WorkspaceDepth } from "./workspace-depth";
import type {
  CanvasSurfaceId,
  HeaderControlId,
  HomeSectionId,
  MoreItemId,
  RailToolId,
  SlotPanelId,
  StripContentId,
} from "./workspace-panels";

export type FeatureHome =
  | { region: "rail"; id: RailToolId }
  | { region: "slot"; id: SlotPanelId }
  | { region: "more"; id: MoreItemId }
  | { region: "header"; id: HeaderControlId }
  | { region: "stepper" }
  | { region: "canvas"; id: CanvasSurfaceId }
  | { region: "strip"; id: StripContentId }
  | { region: "home"; id: HomeSectionId };

export interface WorkspaceFeature {
  id: string;
  /** Where it came from — "kit" = the old résumé builder. */
  from: "kit" | "/studio" | "both" | "new";
  homes: readonly FeatureHome[];
  /** The depth it is reachable at (the shallowest of its homes). */
  depth: WorkspaceDepth;
  /** Not built yet — the ROADMAP gap that tracks it ("#2350"). */
  planned?: `#${number}`;
}

const rail = (id: RailToolId): FeatureHome => ({ region: "rail", id });
const slot = (id: SlotPanelId): FeatureHome => ({ region: "slot", id });
const more = (id: MoreItemId): FeatureHome => ({ region: "more", id });
const header = (id: HeaderControlId): FeatureHome => ({ region: "header", id });
const canvas = (id: CanvasSurfaceId): FeatureHome => ({ region: "canvas", id });
const strip = (id: StripContentId): FeatureHome => ({ region: "strip", id });
const home = (id: HomeSectionId): FeatureHome => ({ region: "home", id });
const STEPPER: FeatureHome = { region: "stepper" };

export const WORKSPACE_FEATURES: readonly WorkspaceFeature[] = [
  { id: "intake", from: "kit", homes: [canvas("dropZone"), rail("chat")], depth: "simple" },
  { id: "kitDrop", from: "new", homes: [canvas("dropZone"), home("dropZone")], depth: "simple" },
  { id: "chat", from: "kit", homes: [rail("chat")], depth: "simple" },
  { id: "studioAi", from: "/studio", homes: [rail("chat")], depth: "simple" },
  { id: "stepper", from: "kit", homes: [STEPPER], depth: "simple" },
  { id: "resumeDesign", from: "kit", homes: [rail("design")], depth: "simple" },
  { id: "sections", from: "kit", homes: [rail("sections"), canvas("resumePage")], depth: "simple" },
  { id: "reviews", from: "kit", homes: [canvas("resumePage"), slot("inspector")], depth: "simple" },
  { id: "coverLetter", from: "kit", homes: [canvas("letterPage")], depth: "simple" },
  { id: "toolPages", from: "kit", homes: [slot("tool")], depth: "simple" },
  { id: "kitVideo", from: "kit", homes: [canvas("kitVideo"), slot("inspector"), strip("sceneRows")], depth: "simple" },
  { id: "frameEditing", from: "both", homes: [canvas("kitVideo"), canvas("runtime")], depth: "simple" },
  { id: "scenesRail", from: "/studio", homes: [rail("scenes")], depth: "advanced" },
  { id: "widgets", from: "/studio", homes: [rail("elements")], depth: "advanced" },
  { id: "actions", from: "/studio", homes: [rail("elements")], depth: "advanced" },
  { id: "media", from: "both", homes: [rail("media")], depth: "simple" },
  { id: "voice", from: "both", homes: [rail("media"), slot("inspector")], depth: "simple" },
  { id: "sceneProperties", from: "/studio", homes: [slot("inspector")], depth: "advanced" },
  // Format · theme · palette · fonts in Design; motion · music · export in the inspector.
  { id: "canvasProperties", from: "/studio", homes: [rail("design"), slot("inspector")], depth: "simple" },
  { id: "brandingA11y", from: "/studio", homes: [slot("inspector")], depth: "advanced" },
  { id: "multiTrack", from: "/studio", homes: [strip("tracks"), rail("layers")], depth: "advanced" },
  { id: "sceneRows", from: "kit", homes: [strip("sceneRows")], depth: "simple" },
  // Captions are an Action (Elements) and a timeline track in the studio.
  { id: "captions", from: "/studio", homes: [rail("elements"), strip("tracks")], depth: "advanced" },
  { id: "undoRedo", from: "both", homes: [header("undo"), header("redo")], depth: "simple" },
  { id: "saving", from: "both", homes: [header("saveStatus"), more("saveAs"), more("versions")], depth: "simple" },
  { id: "downloadPdf", from: "kit", homes: [more("download")], depth: "simple" },
  { id: "details", from: "/studio", homes: [more("details")], depth: "simple" },
  { id: "preview", from: "both", homes: [header("preview"), strip("sceneRows")], depth: "simple" },
  { id: "reviewing", from: "/studio", homes: [more("reviewing")], depth: "advanced" },
  { id: "embed", from: "/studio", homes: [more("embed")], depth: "advanced" },
  { id: "collaboration", from: "/studio", homes: [more("invite"), header("title")], depth: "advanced" },
  { id: "workspaceSwitcher", from: "/studio", homes: [home("workspaceSwitcher"), more("details")], depth: "simple" },
  { id: "post", from: "both", homes: [slot("post"), STEPPER, header("post")], depth: "simple" },
  { id: "analytics", from: "/studio", homes: [more("details"), home("yourWork")], depth: "simple" },
  { id: "runtimes", from: "/studio", homes: [canvas("runtime"), header("preview")], depth: "simple" },
  { id: "startWithAi", from: "/studio", homes: [home("newMenu"), rail("chat")], depth: "simple" },
  { id: "guestFirst", from: "kit", homes: [header("more"), slot("post")], depth: "simple" },
  // #2350 (shipped): the kit video's Design tool — "Made for [audience] with the [theme] theme", goal, start, shape.
  { id: "themeByDate", from: "new", homes: [rail("design")], depth: "simple" },
  // #2351 (shipped): kit documents as editable surfaces.
  // Résumé "This line" (Wording · Findings · Job match), opened by a line click or a finding flag.
  { id: "resumeLineInspector", from: "new", homes: [canvas("resumePage"), slot("inspector")], depth: "simple" },
  // Free elements on the résumé / letter pages, with hide / lock, and the selected element's inspector.
  { id: "documentElements", from: "new", homes: [rail("elements"), rail("layers"), slot("inspector")], depth: "advanced" },
  // The letter's Tone and styles (font, size, spacing, Letter / A4).
  { id: "letterToneStyles", from: "new", homes: [canvas("letterPage"), slot("inspector")], depth: "simple" },
  // The video scene's Advanced drill-ins (Background … Export) under its three plain rows.
  { id: "kitSceneDrillIn", from: "new", homes: [slot("inspector")], depth: "advanced" },
];
