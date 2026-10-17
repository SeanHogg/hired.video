/**
 * #374 / #375 — every analyzer recommendation maps to a wand through its
 * structured action (never the prose), and the new wands are registry
 * entries: merge two work entries (pure, previewed and committed on the
 * current draft), and the bullet / section wands staged like the rest.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";
import { WAND_ACTION_IDS } from "@shared/tool-schemas";

import { apiClient } from "@/lib/api-client";
import { findWandForRecommendation } from "@/lib/tools/find-wand-for-recommendation";
import { mergeWorkEntries } from "@/lib/tools/merge-work-entries";
import { getTool } from "@/lib/tools/registry";

const RESUME_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("findWandForRecommendation — structured actions only", () => {
  it("maps a valid action to its wand, label and args", () => {
    expect(
      findWandForRecommendation({ actionId: "strengthen_bullet_verbs", actionArgs: { original: "Responsible for vendor management" } }),
    ).toEqual({
      toolId: "strengthen_bullet_verbs",
      labelKey: "wands.action.strengthen_bullet_verbs",
      args: { original: "Responsible for vendor management" },
    });
  });

  it("does NOT keyword-match the prose: no action → no wand", () => {
    // The old resolver would have matched this to standardize_resume_dates.
    expect(
      findWandForRecommendation({
        category: "format",
        title: "Standardize inconsistent date formats",
        description: "Dates mix formats.",
      } as never),
    ).toBeNull();
  });

  it("rejects unknown ids and args that don't fit", () => {
    expect(findWandForRecommendation({ actionId: "rewrite_summary", actionArgs: {} })).toBeNull();
    expect(findWandForRecommendation({ actionId: "merge_work_entries", actionArgs: { first: "Acme" } })).toBeNull();
  });

  it("every wand id is a registry tool", () => {
    for (const id of WAND_ACTION_IDS) expect(getTool(id), id).toBeDefined();
  });
});

const content = (): ResumeContent =>
  ({
    basics: { name: "Ana Ruiz" },
    work: [
      { id: "w1", name: "Acme Corp", position: "Director of IT", startDate: "2021-04", endDate: "", summary: "Led IT.", highlights: ["Cut costs 20%", "Built the service desk"] },
      { id: "w2", name: "Globex", position: "IT Manager", startDate: "2016-01", endDate: "2018-06", summary: "", highlights: ["Ran helpdesk"] },
      { id: "w3", name: "Acme", position: "IT Manager", startDate: "2018-07", endDate: "2021-03", summary: "Ran infrastructure.", highlights: ["Built the service desk", "Migrated email to Office 365"] },
    ],
  }) as unknown as ResumeContent;

describe("mergeWorkEntries", () => {
  it("keeps the first entry, adds the second's new bullets, spans the dates, removes the second", () => {
    const merge = mergeWorkEntries(content(), "Acme Corp", "Acme");
    expect(merge).not.toBeNull();
    const work = merge!.next.work!;
    expect(work.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(work[0]).toMatchObject({
      position: "Director of IT",
      startDate: "2018-07",
      endDate: "",
      summary: "Led IT. Ran infrastructure.",
      highlights: ["Cut costs 20%", "Built the service desk", "Migrated email to Office 365"],
    });
  });

  it("finds an entry by 'position @ company' too", () => {
    expect(mergeWorkEntries(content(), "Director of IT @ Acme Corp", "Globex")?.removed).toBe(1);
  });

  it("is null when either entry is missing, or both name the same one", () => {
    expect(mergeWorkEntries(content(), "Initech", "Acme")).toBeNull();
    expect(mergeWorkEntries({ basics: { name: "" } } as unknown as ResumeContent, "Acme", "Globex")).toBeNull();
    expect(mergeWorkEntries({ ...content(), work: [content().work![1]] }, "Globex", "Globex")).toBeNull();
  });
});

describe("the new wands stage a pending change", () => {
  it("merge_work_entries previews the merged entry without writing", async () => {
    const { registerResumeDraft, unregisterResumeDraft } = await import("@/lib/tools/resume-draft-bridge");
    const commit = vi.fn();
    const handle = { resumeId: RESUME_ID, getContent: content, commit };
    registerResumeDraft(handle);
    try {
      const out = await getTool("merge_work_entries")!.run({ bound: { resumeId: RESUME_ID }, args: { first: "Acme Corp", second: "Acme" } });
      expect(out.mutation?.status).toBe("pending");
      expect(out.raw).toEqual({ kind: "merge_work_entries", resumeId: RESUME_ID, first: "Acme Corp", second: "Acme" });
      expect(commit).not.toHaveBeenCalled();
    } finally {
      unregisterResumeDraft(handle);
    }
  });

  afterEach(() => vi.restoreAllMocks());

  it("add_bullet_metric stages the rewrite through apply_resume_rewrite", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValueOnce({ data: { improved: "Cut vendor spend [N]% across 12 contracts" } } as never);
    const out = await getTool("add_bullet_metric")!.run({
      bound: { resumeId: RESUME_ID },
      args: { original: "Responsible for vendor management across 12 contracts" },
    });
    expect(post.mock.calls[0][0]).toBe("/api/ai/tools/resume-rewrite-bullet");
    expect(post.mock.calls[0][1]).toEqual({ original: "Responsible for vendor management across 12 contracts", mode: "metric" });
    expect(out.raw).toEqual({
      kind: "apply_resume_rewrite",
      resumeId: RESUME_ID,
      original: "Responsible for vendor management across 12 contracts",
      improved: "Cut vendor spend [N]% across 12 contracts",
    });
  });

  it("a wand with no bound résumé fails clearly", async () => {
    await expect(getTool("strengthen_bullet_verbs")!.run({ bound: {}, args: { original: "Helped launch the app" } })).rejects.toThrow();
  });
});
