/**
 * #3180 / ROADMAP #2220 (dead-branch cleanup — NOT reviewer authoring):
 * After /studio/new → real-id mint (#699 / #706), StudioEditorV2 must not
 * special-case résumé / kit-new / subject=resume / resumeId. `/studio/new`
 * remains a generic unsaved-draft sentinel (stale-URL grace), not a
 * résumé-only path.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/studio-editor-v2-resume-branches.test.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(
  join(here, "../../../../pages/studio/v2/StudioEditorV2.tsx"),
  "utf8",
);
const lifecycle = readFileSync(
  join(here, "../use-studio-project-lifecycle.ts"),
  "utf8",
);

describe("StudioEditorV2 dead résumé branches (#3180 / #2220)", () => {
  it("does not branch on resume / subject=resume / resumeId / kit-new", () => {
    expect(editor).not.toMatch(/\bresumeId\b/i);
    expect(editor).not.toMatch(/kit-new/);
    expect(editor).not.toMatch(/subject\s*===\s*["']resume["']/);
    expect(editor).not.toMatch(/\bresume\b/i);
  });

  it("treats /studio/new as a subject-agnostic unsaved draft", () => {
    // Sentinel is route-id only — no résumé / subject gate.
    expect(lifecycle).toMatch(
      /export function savedProjectIdFromRoute\(routeId: string\): string \| null \{\s*return routeId === "new" \? null : routeId;/,
    );
    expect(lifecycle).toMatch(/if \(projectId === "new"/);
    expect(lifecycle).not.toMatch(/subject\s*===\s*["']resume["']/);
    expect(lifecycle).not.toMatch(/kit-new/);
    expect(lifecycle).not.toMatch(/\bresumeId\b/);
  });
});
