/**
 * Request-body parsing for POST /api/jobs/createfromfile. HTTP-only (reads
 * the Hono request), so it lives at the route edge; re-exported from
 * routes/jobs.ts.
 */
import type { AppContext } from "../../types/index.js";
import { extractPdfText } from "../../utils/pdf-extract.js";
import { readForm } from "../../utils/multipart.js";

/**
 * Accepts either a multipart upload (`file` + optional `location`) or a JSON
 * body (`{ title?, description?, location? }`) and returns the raw text
 * content of the upload along with the display filename. Pure — does not
 * touch the DB.
 *
 * PDF uploads are decoded via the shared `extractPdfText` helper so the
 * downstream extractor sees plain text, not compressed PDF bytes.
 */
export async function extractCreateFromFilePayload(c: AppContext): Promise<{
  title: string;
  description: string;
  location: string | undefined;
}> {
  const contentType = c.req.header("Content-Type") ?? "";
  let title = "Imported Job";
  let description = "";
  let location: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await readForm(c);
    const file = form?.get("file") as unknown as File | null;
    if (file) {
      // Strip the extension — we'll use the filename as a fallback title
      // when the AI extractor can't find one in the content itself.
      title = (file.name || title).replace(/\.(pdf|docx?|txt|md|html?)$/i, "");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const bytes = await file.arrayBuffer().catch(() => null);
        if (bytes) description = await extractPdfText(new Uint8Array(bytes));
      } else {
        description = await file.text().catch(() => "");
      }
    }
    if (form?.has("location")) {
      location = String(form.get("location"));
    }
  } else {
    const body = await c.req.json().catch(() => null);
    if (body) {
      if (typeof body.title === "string" && body.title.length > 0) title = body.title;
      if (typeof body.description === "string") description = body.description;
      if (typeof body.location === "string") location = body.location;
    }
  }

  return { title, description, location };
}
