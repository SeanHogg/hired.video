/** Which stored draft a kit picks up (the browser keeps only the last one). */
import { describe, expect, it } from "vitest";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { keepsStoredDraft } from "../kit-draft";

const unsaved = { source: { kind: "file" as const, name: "cv.pdf" }, savedResumeId: null };
const savedFile = { source: { kind: "file" as const, name: "cv.pdf" }, savedResumeId: "r1" };
const opened = { source: { kind: "existing" as const, title: "CV", resumeId: "r1" }, savedResumeId: "r1" };

describe("keepsStoredDraft", () => {
  it("never picks up a stored draft at a résumé's own address (the row is loaded)", () => {
    const at = { resumeId: "r1", pathname: "/studio/p1", pushed: false };
    expect(keepsStoredDraft(opened, at)).toBe(false);
    expect(keepsStoredDraft(savedFile, at)).toBe(false);
    expect(keepsStoredDraft(unsaved, at)).toBe(false);
  });

  it("starts a new kit asked for from a link blank", () => {
    expect(keepsStoredDraft(unsaved, { resumeId: null, pathname: NEW_KIT_PATH, pushed: true })).toBe(false);
  });

  it("keeps only an unsaved draft on a reload or Back to the new kit", () => {
    const at = { resumeId: null, pathname: NEW_KIT_PATH, pushed: false };
    expect(keepsStoredDraft(unsaved, at)).toBe(true);
    expect(keepsStoredDraft(savedFile, at)).toBe(false);
    expect(keepsStoredDraft(opened, at)).toBe(false);
  });

  it("keeps the draft of a kit handed over to its project, but a link there doesn't reopen the last saved kit", () => {
    expect(keepsStoredDraft(unsaved, { resumeId: null, pathname: "/studio/p1", pushed: true })).toBe(true);
    expect(keepsStoredDraft(savedFile, { resumeId: null, pathname: "/studio/p1", pushed: false })).toBe(true);
    expect(keepsStoredDraft(savedFile, { resumeId: null, pathname: "/studio/p1", pushed: true })).toBe(false);
    expect(keepsStoredDraft(opened, { resumeId: null, pathname: "/studio/p1", pushed: true })).toBe(false);
  });
});
