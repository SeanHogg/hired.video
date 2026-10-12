/**
 * "Save design as template" round trip: the kit's design on screen →
 * the payload it publishes (kitDesignDocument) → the API's content strip
 * (shared/resume-template-snapshot.ts, the SAME function the publish path
 * runs) → the stored studio template row → the apply path ("Use this
 * template": resolveKitDesign → withDocumentLayout → resolveResumeDescriptor)
 * renders the SAME design on another résumé, with none of the author's
 * details.
 *
 * Fixtures mirror real résumé rows: `dana` is the author's saved résumé
 * (contact details, work text, a picked design + look); `sam` is the résumé
 * that wears the template.
 */
import { describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";
import { stripResumeDocumentForTemplate } from "@shared/resume-template-snapshot";

const getBySlugOrId = vi.fn();
vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: { getBySlugOrId: (ref: string) => getBySlugOrId(ref) },
}));

import { resolveKitDesign } from "@/lib/workspace/kit/use-kit-template";
import { designDescriptor, resolveResumeDescriptor, withDocumentLayout, type ResumeDesign } from "@/lib/resume-design";
import { kitDesignDocument } from "@/lib/templates/resume-design-document";
import { descriptorForDesign, resumeTemplateDesign } from "@/lib/templates/resume-template-design";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { RESUME_SIZE_SCALE } from "@/lib/build/resume-style";

const dana = {
  basics: {
    name: "Dana Okafor",
    label: "Registered Nurse",
    email: "dana.okafor@gmail.com",
    phone: "(415) 555-0142",
    summary: "ICU charge nurse with 9 years across cardiac and trauma units.",
    location: { city: "Oakland", region: "CA" },
    profiles: [{ network: "LinkedIn", url: "https://linkedin.com/in/danaokafor" }],
  },
  work: [
    {
      id: "work-kaiser-0",
      name: "Kaiser Permanente",
      position: "Charge Nurse, Cardiac ICU",
      startDate: "2019-04",
      highlights: ["Led a 14-nurse night shift for a 24-bed cardiac ICU"],
    },
  ],
  education: [{ institution: "UCSF School of Nursing", studyType: "BSN", endDate: "2016" }],
  skills: [{ name: "Critical care", keywords: ["ACLS", "Telemetry"] }],
  certificates: [{ name: "CCRN", issuer: "AACN" }],
  meta: { template: "healthcare-clinical-blue", structure: "hybrid" },
} as unknown as ResumeContent;

const sam = {
  basics: { name: "Sam Rivera", label: "Physical Therapist", email: "sam.rivera@outlook.com" },
  work: [{ name: "Sutter Health", position: "PT", startDate: "2021-02" }],
  meta: { template: "payroll-iron-gray" },
} as unknown as ResumeContent;

const PERSONAL = [
  "Dana Okafor",
  "dana.okafor@gmail.com",
  "(415) 555-0142",
  "danaokafor",
  "Kaiser Permanente",
  "Led a 14-nurse night shift",
  "UCSF",
  "Oakland",
];

/** The design Dana picked in the kit: a template, a structure, a look. */
const picked: ResumeDesign = {
  templateId: "healthcare-clinical-blue",
  structure: "hybrid",
  style: { colour: "executive-navy", font: "serif", spacing: "spacious", paper: "a4", size: "large" },
};

/** What the API stores for it: the published payload, content-stripped. */
function publishedRow(payload: DocumentState) {
  return {
    id: "6d0f7a3e-2b1c-4e5d-9f8a-7b6c5d4e3f2a",
    listingSlug: null,
    name: "Clinical Blue (my version)",
    mediaKind: "document" as const,
    documentKind: "resume" as const,
    videoScript: stripResumeDocumentForTemplate(payload),
  };
}

describe("Save design as template → Use this template", () => {
  const onScreen = designDescriptor(dana, picked);
  const payload = kitDesignDocument(dana, onScreen, false);
  const row = publishedRow(payload);

  it("publishes a résumé document bound to no résumé", () => {
    expect(payload.entityKind).toBe("resume");
    expect(payload.entityId).toBeNull();
    expect(row.videoScript.entityId).toBeNull();
  });

  it("stores the text size with the design", () => {
    expect((row.videoScript.theme as { fontScale?: number }).fontScale).toBe(RESUME_SIZE_SCALE.large);
  });

  it("stores none of the author's details", () => {
    const json = JSON.stringify(row.videoScript);
    expect(PERSONAL.filter((value) => json.includes(value))).toEqual([]);
  });

  it("is a résumé template the kit can wear (a page layout)", async () => {
    getBySlugOrId.mockResolvedValue(row);
    const design = await resolveKitDesign(row.id);
    expect(getBySlugOrId).toHaveBeenCalledWith(row.id);
    expect(design?.kind).toBe("layout");
  });

  it("renders the same design on the résumé that wears it", async () => {
    getBySlugOrId.mockResolvedValue(row);
    const design = await resolveKitDesign(row.id);
    if (design?.kind !== "layout") throw new Error("expected a layout design");
    const worn = resolveResumeDescriptor(withDocumentLayout(sam, design.layout));

    expect(worn.id).toBe(onScreen.id);
    expect(worn.theme.themeKey).toBe("executive-navy");
    expect(worn.theme.fontFamily).toBe("serif");
    expect(worn.theme.density).toBe("spacious");
    expect(worn.theme.headingStyle).toBe(onScreen.theme.headingStyle);
    expect(worn.theme.cardStyle).toBe(onScreen.theme.cardStyle);
    expect(worn.paper).toBe("a4");
    // The look's text size carries over (theme.fontScale in the payload).
    expect(onScreen.theme.fontScale).toBe(RESUME_SIZE_SCALE.large);
    expect(worn.theme.fontScale).toBe(RESUME_SIZE_SCALE.large);
    expect(worn.layout).toEqual(onScreen.layout);
    expect(worn.hero.enabled).toBe(onScreen.hero.enabled);
    const order = (d: typeof onScreen) =>
      d.sections.filter((b) => b.enabled).map((b) => (b.kind === "component" ? b.component : `${b.key}:${b.layout}`));
    expect(order(worn)).toEqual(order(onScreen));
    // …and Sam's own content stays Sam's.
    expect(withDocumentLayout(sam, design.layout).basics).toEqual(sam.basics);
  });

  it("previews the same design on its template card", () => {
    const design = resumeTemplateDesign(row);
    expect(design).not.toBeNull();
    expect(design && descriptorForDesign(design)?.theme.themeKey).toBe("executive-navy");
  });

  it("publishes the résumé's own studio layout while the kit still shows it", () => {
    const layout = { ...payload, templateId: "creative-minimal", entityId: "1f2e3d4c-5b6a-4789-8a9b-0c1d2e3f4a5b" };
    const withLayout = { ...dana, meta: { documentLayout: layout } } as unknown as ResumeContent;
    expect(kitDesignDocument(withLayout, onScreen, true)).toBe(layout);
    expect(kitDesignDocument(withLayout, onScreen, false).templateId).toBe("healthcare-clinical-blue");
  });
});
