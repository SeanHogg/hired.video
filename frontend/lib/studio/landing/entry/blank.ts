/**
 * Non-template seed paths — entity-card "Create Video" buttons emit
 * `?subject=resume:abc&new=1`; the chrome extension emits `?capture=...`;
 * marketing CTAs sometimes emit `?new=1` to force a fresh start. All three
 * mint a blank server-side draft (with the subject linked if present) and
 * land on /studio/<real-id>?capture=... so the editor receives the UI-state
 * seed without a route bounce.
 */
import { parseStudioSubject } from "@shared/studio-subject";
import { projectOutcome, type EntryHandler } from "./types";

export const blankEntry: EntryHandler = {
  id: "blank",
  matches: (params) =>
    parseStudioSubject(params.get("subject")) !== null ||
    params.has("capture") ||
    params.has("new"),
  run: async ({ params, create }) => {
    const subject = parseStudioSubject(params.get("subject"));
    const created = await create({
      kind: "blank",
      subjects: subject ? [subject] : undefined,
    });
    return projectOutcome(created, params);
  },
};
