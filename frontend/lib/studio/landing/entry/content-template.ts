/**
 * `?contentTemplate=<slug>` — a built-in catalog template. An unknown slug
 * doesn't match here (later entries, e.g. `?new=1`, still get their turn);
 * if nothing else matches, the table's fallback drops the params.
 */
import { slugToBuiltinId } from "@/lib/templates/registry";
import { projectOutcome, FAILED, type EntryHandler } from "./types";

export const contentTemplateEntry: EntryHandler = {
  id: "contentTemplate",
  matches: (params) => {
    const slug = params.get("contentTemplate");
    return !!slug && slugToBuiltinId(slug) !== null;
  },
  run: async ({ params, create }) => {
    const id = slugToBuiltinId(params.get("contentTemplate") ?? "");
    if (!id) return FAILED;
    const created = await create({ kind: "template", templateId: id });
    return projectOutcome(created, params);
  },
};
