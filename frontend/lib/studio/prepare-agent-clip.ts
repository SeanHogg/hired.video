/**
 * Render (or reuse) the fitted cut an agent draft needs, then return the
 * `render_variants` row id the prepare/approve endpoints attach.
 *
 * Same canvas + branding path as the Hub's compose dock (`hubVariantSource`
 * + `ensureVariant`): a stored cut is reused; otherwise the browser renders
 * it. Throws when the project cannot yield a cut (stale master, empty
 * canvas, unknown key).
 */
import { parseVariantKey } from "@shared/publish-presets";
import { hubVariantSource } from "@/components/studio/distribution/useHubCutPublisher";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { ensureVariant, type VariantSource } from "@/lib/studio/publish-variants";

export class PrepareAgentClipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrepareAgentClipError";
  }
}

export interface PrepareAgentClipArgs {
  projectId: string;
  variantKey: string;
  includeBranding: boolean;
  campaign?: VariantSource["campaign"];
  onProgress?: (progress: number) => void;
  getProject?: (projectId: string) => Promise<{ data: StudioProject }>;
  sourceFor?: typeof hubVariantSource;
  ensure?: typeof ensureVariant;
}

/** The cut's row id, ready to attach to the draft. */
export async function prepareAgentClip(args: PrepareAgentClipArgs): Promise<string> {
  const spec = parseVariantKey(args.variantKey);
  if (!spec) throw new PrepareAgentClipError("Unknown clip shape.");

  const getProject = args.getProject ?? studioService.getProject.bind(studioService);
  const sourceFor = args.sourceFor ?? hubVariantSource;
  const ensure = args.ensure ?? ensureVariant;

  const project = (await getProject(args.projectId)).data;
  const source = sourceFor(project, {
    includeBranding: args.includeBranding,
    campaign: args.campaign,
  });
  if (!source) throw new PrepareAgentClipError("This project has no cut to prepare.");

  const cut = await ensure({
    projectId: project.id,
    title: project.title,
    source,
    spec,
    onProgress: args.onProgress,
  });
  if (!cut) throw new PrepareAgentClipError("Could not render the clip.");
  return cut.variantId;
}
