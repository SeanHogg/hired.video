/**
 * Direct deep-link into the studio editor for a resume.
 *
 * "Edit" used to always navigate to `/studio?editResume=<id>`, a bootstrap
 * route that then resolved (or minted) the canvas document project and
 * `replace`d the URL with the canonical `/studio/<projectId>`. That left a
 * visible `?editResume=` redirect hop on every edit. Once a resume has been
 * edited on the canvas it already HAS a document project, so we can resolve it
 * up front and land straight in the editor with no intermediate URL.
 *
 * Falls back to the `?editResume=` bootstrap only on the first-ever edit, when
 * no document project exists yet and the landing route must seed one.
 */
import { studioService } from "@/lib/services/studio-service";

export async function resumeEditorPath(resumeId: string): Promise<string> {
  const doc = await studioService.findDocumentProject({
    kind: "resume",
    id: resumeId,
  });
  return doc
    ? `/studio/${encodeURIComponent(doc.id)}`
    : `/studio?editResume=${encodeURIComponent(resumeId)}`;
}
