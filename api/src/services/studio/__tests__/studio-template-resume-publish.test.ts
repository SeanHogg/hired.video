/**
 * Saving a résumé's design as a résumé template (the career kit's "Save
 * design as template") through the ONE publish use case:
 *   • the snapshot keeps the design and drops every personal value;
 *   • only the résumé's owner may publish it;
 *   • the row is media_kind 'document' / document_kind 'resume', private by
 *     default, with the creator's owner license granted as ('studio', id);
 *   • listing it PUBLICLY needs the Templates creator program — or the
 *     legacy Video flag (#891, shared `canPublishTemplates`).
 *
 * Fixtures mirror real data: `danaLayout` is a résumé studio layout as it
 * sits in `resume_information.content.meta.documentLayout` (free text block,
 * text / chips / image / linked-content overlays, a media-bound photo), and
 * `danaContent` the résumé row's content around it.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/studio-template-resume-publish.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { StudioTemplatesService, type DbHandle, type TemplatePublishingFlags } from "../StudioTemplatesService.js";
import { StudioTemplatesError } from "../studioTemplatesErrors.js";
import { resumeTemplateSnapshot } from "../studioTemplateSnapshot.js";
import { storedResumeDesign } from "../templateSource.js";
import type {
  IStudioTemplatesRepository,
  StudioTemplateInsert,
  StudioTemplateRow,
  TemplateLicenseInsert,
} from "../../../repositories/index.js";

const OWNER = "3b9f0c1e-7d2a-4f5b-8e6c-1a2b3c4d5e6f";
const STRANGER = "8c7b6a59-4e3d-4c2b-9a18-07f6e5d4c3b2";
const RESUME_ID = "1f2e3d4c-5b6a-4789-8a9b-0c1d2e3f4a5b";
const at = new Date("2026-10-10T15:20:00.000Z");

/** Every personal value in the fixtures — none may survive a snapshot. */
const PERSONAL = [
  "Dana Okafor",
  "dana.okafor@gmail.com",
  "(415) 555-0142",
  "linkedin.com/in/danaokafor",
  "Kaiser Permanente",
  "Charge nurse for a 24-bed cardiac ICU",
  "https://cdn.hired.video/u/dana-headshot.jpg",
  "https://cdn.hired.video/u/dana-reel.mp4",
  "Oakland, CA",
];

const danaLayout = {
  schemaVersion: 1,
  entityKind: "resume",
  entityId: RESUME_ID,
  templateId: "healthcare-clinical-blue",
  pageSize: "a4",
  orientation: "portrait",
  columns: 12,
  theme: { themeKey: "clinical-blue", fontFamily: "serif", headingStyle: "caps", density: "compact", cardStyle: "flat", fontScale: 1.08 },
  pages: [
    {
      id: "page-1",
      blocks: [
        { id: "b-basics", kind: "section", sectionKey: "basics", title: "Header", layout: "compact", mode: "flow" },
        { id: "b-tagline", kind: "text", title: "Dana Okafor", text: "Dana Okafor · Oakland, CA · (415) 555-0142", mode: "flow" },
        { id: "b-work", kind: "section", sectionKey: "work", title: "Work Experience", layout: "timeline", mode: "flow" },
        { id: "b-skills", kind: "section", key: "skills", title: "Skills", layout: "grid", mode: "absolute", box: { x: 0.6, y: 0.1, width: 0.4, height: 0.3, z: 1 } },
        { id: "b-photo", kind: "image", imageUrl: "https://cdn.hired.video/u/dana-headshot.jpg", mode: "flow" },
      ],
      overlays: [
        {
          widget: {
            id: "w-contact",
            kind: "text",
            position: { x: 0.05, y: 0.02, width: 0.5, height: 0.05, z: 3, rotation: 0 },
            params: { text: "dana.okafor@gmail.com · linkedin.com/in/danaokafor", color: "#0f172a", fontFamily: "serif", fontSize: 12 },
            visibleFrom: null,
            visibleTo: null,
            motion: null,
          },
        },
        {
          widget: {
            id: "w-employers",
            kind: "chips",
            position: { x: 0.1, y: 0.8, width: 0.8, height: 0.05, z: 2, rotation: 0 },
            params: { items: ["Kaiser Permanente", "UCSF Health"], variant: "outline" },
            visibleFrom: null,
            visibleTo: null,
            motion: { kind: "fade", easing: "ease-out", durationSec: 0.4 },
          },
        },
        {
          widget: {
            id: "w-photo",
            kind: "image",
            position: { x: 0.75, y: 0.02, width: 0.2, height: 0.15, z: 4, rotation: 0 },
            params: { src: "https://cdn.hired.video/u/dana-headshot.jpg", fit: "cover", alt: "Dana Okafor" },
            visibleFrom: null,
            visibleTo: null,
            motion: null,
          },
          mediaBinding: { referenceId: "work-kaiser-0", itemType: "work" },
        },
        {
          widget: {
            id: "w-reel",
            kind: "linked-content",
            position: { x: 0.1, y: 0.9, width: 0.3, height: 0.08, z: 5, rotation: 0 },
            params: { url: "https://cdn.hired.video/u/dana-reel.mp4", caption: "Charge nurse for a 24-bed cardiac ICU" },
            visibleFrom: null,
            visibleTo: null,
            motion: null,
          },
        },
      ],
    },
  ],
};

const danaContent = {
  basics: {
    name: "Dana Okafor",
    label: "Registered Nurse",
    email: "dana.okafor@gmail.com",
    phone: "(415) 555-0142",
    location: { city: "Oakland, CA" },
    profiles: [{ network: "LinkedIn", url: "linkedin.com/in/danaokafor" }],
  },
  work: [{ id: "work-kaiser-0", name: "Kaiser Permanente", position: "Charge Nurse", summary: "Charge nurse for a 24-bed cardiac ICU" }],
  meta: { documentLayout: danaLayout, style: { colour: "clinical-blue" } },
};

const leaks = (payload: unknown) => {
  const json = JSON.stringify(payload);
  return PERSONAL.filter((value) => json.includes(value));
};

// ─── Snapshot ────────────────────────────────────────────────────────────────

describe("resumeTemplateSnapshot — strips personal content", () => {
  it("keeps no name, email, phone, link, employer, work text, photo or reel", () => {
    assert.deepEqual(leaks(resumeTemplateSnapshot(danaLayout).videoScript), []);
  });

  it("drops content smuggled into a live payload alongside the layout", () => {
    const smuggled = { ...danaLayout, basics: danaContent.basics, work: danaContent.work, resumeText: "Dana Okafor RN" };
    const snap = resumeTemplateSnapshot(smuggled).videoScript;
    assert.deepEqual(leaks(snap), []);
    assert.equal("basics" in snap, false);
    assert.equal("resumeText" in snap, false);
  });

  it("keeps the design: page setup, theme, section order, layout, geometry and style tokens", () => {
    const snap = resumeTemplateSnapshot(danaLayout);
    assert.equal(snap.documentKind, "resume");
    const v = snap.videoScript as typeof danaLayout;
    assert.equal(v.entityKind, "resume");
    assert.equal(v.entityId, null);
    assert.deepEqual([v.templateId, v.pageSize, v.orientation, v.columns], ["healthcare-clinical-blue", "a4", "portrait", 12]);
    assert.deepEqual(v.theme, danaLayout.theme);
    const blocks = v.pages[0]!.blocks as Array<Record<string, unknown>>;
    assert.deepEqual(blocks.map((b) => b.id), ["b-basics", "b-tagline", "b-work", "b-skills", "b-photo"]);
    assert.deepEqual(blocks.map((b) => b.sectionKey ?? b.key ?? null), ["basics", null, "work", "skills", null]);
    assert.equal(blocks[2]!.title, "Work Experience");
    assert.equal(blocks[2]!.layout, "timeline");
    assert.deepEqual(blocks[3]!.box, danaLayout.pages[0]!.blocks[3]!.box);
    assert.equal(blocks[1]!.text, "{{text}}");
    assert.equal("imageUrl" in blocks[4]!, false);
    const overlays = v.pages[0]!.overlays as Array<{ widget: { params: Record<string, unknown>; position: unknown }; mediaBinding?: unknown }>;
    assert.equal(overlays.length, 4);
    assert.ok(overlays.every((o) => o.mediaBinding === undefined));
    assert.deepEqual(overlays[0]!.widget.params, { text: "{{text}}", color: "#0f172a", fontFamily: "serif", fontSize: 12 });
    assert.deepEqual(overlays[0]!.widget.position, danaLayout.pages[0]!.overlays[0]!.widget.position);
    assert.deepEqual(overlays[1]!.widget.params, { items: [], variant: "outline" });
    assert.deepEqual(overlays[2]!.widget.params, { fit: "cover", alt: "{{text}}" });
  });

  it("never mutates the résumé's own layout", () => {
    resumeTemplateSnapshot(danaLayout);
    assert.equal(danaLayout.entityId, RESUME_ID);
    assert.ok("mediaBinding" in danaLayout.pages[0]!.overlays[2]!);
  });
});

describe("storedResumeDesign — the résumé's saved design", () => {
  it("is its studio layout when it has one", () => {
    assert.equal(storedResumeDesign(danaContent), danaLayout);
  });
  it("is the built-in design it names otherwise", () => {
    assert.deepEqual(storedResumeDesign({ meta: { template: "modern-minimal" } }), {
      entityKind: "resume",
      entityId: null,
      templateId: "modern-minimal",
      pages: [],
    });
  });
  it("is null for a résumé with no design", () => {
    assert.equal(storedResumeDesign({ basics: danaContent.basics }), null);
    assert.equal(storedResumeDesign(null), null);
  });
});

// ─── Publish ─────────────────────────────────────────────────────────────────

class FakeTemplates {
  rows: StudioTemplateRow[] = [];
  licenses: TemplateLicenseInsert[] = [];
  async insert(input: StudioTemplateInsert): Promise<StudioTemplateRow> {
    const row: StudioTemplateRow = {
      id: `tpl-${this.rows.length + 1}`,
      creatorId: input.creatorId,
      companyId: input.companyId ?? null,
      sourceProjectId: input.sourceProjectId ?? null,
      mediaKind: input.mediaKind ?? "video",
      documentKind: input.documentKind ?? null,
      name: input.name,
      description: input.description ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      previewVideoUrl: input.previewVideoUrl ?? null,
      videoScript: input.videoScript,
      durationSec: input.durationSec ?? null,
      motion: input.motion ?? null,
      language: input.language ?? null,
      tags: input.tags ?? [],
      visibility: input.visibility ?? "private",
      listingSlug: input.listingSlug ?? null,
      priceCents: input.priceCents ?? 0,
      currency: input.currency ?? "USD",
      platformFeeBps: input.platformFeeBps ?? 500,
      consentAgreedAt: input.consentAgreedAt ?? null,
      consentIp: input.consentIp ?? null,
      consentUa: input.consentUa ?? null,
      viewCount: 0,
      purchaseCount: 0,
      listingStatus: input.listingStatus ?? "draft",
      ipAttestation: input.ipAttestation ?? null,
      reviewNotes: input.reviewNotes ?? null,
      approvedAt: input.approvedAt ?? null,
      rejectedAt: input.rejectedAt ?? null,
      publishedAt: input.publishedAt ?? null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return row;
  }
  async insertLicense(input: TemplateLicenseInsert) {
    this.licenses.push(input);
    return null;
  }
  async isSlugTaken() {
    return false;
  }
}

let templates: FakeTemplates;
let svc: StudioTemplatesService;

beforeEach(() => {
  templates = new FakeTemplates();
  svc = new StudioTemplatesService({
    db: {} as unknown as DbHandle,
    now: () => at,
    repos: {
      studioTemplates: templates as unknown as IStudioTemplatesRepository,
      media: { findStudioProjectById: async () => null },
      resumes: {
        findById: async (id: string) => (id === RESUME_ID ? { userId: OWNER, content: danaContent } : null),
      },
    },
  });
});

const isCode = (code: string) => (err: unknown) => err instanceof StudioTemplatesError && err.code === code;

const publishAs = (userId: string, extra: { videoScript?: unknown; sourceResumeId?: string } = {}) =>
  svc.publish({ creatorUserId: userId, sourceResumeId: RESUME_ID, name: "Clinical Blue, my way", priceCents: 0, ...extra });

describe("publish from a résumé", () => {
  it("saves a private résumé template (document / resume) with no personal content", async () => {
    const row = await publishAs(OWNER);
    assert.equal(row.mediaKind, "document");
    assert.equal(row.documentKind, "resume");
    assert.equal(row.visibility, "private");
    assert.equal(row.listingSlug, null);
    assert.equal(row.consentAgreedAt, null);
    assert.equal(row.publishedAt, null);
    assert.equal(row.sourceProjectId, null);
    assert.equal(row.companyId, null);
    assert.deepEqual(leaks(row.videoScript), []);
  });

  it("grants the creator the owner license as ('studio', id)", async () => {
    const row = await publishAs(OWNER);
    assert.deepEqual(templates.licenses, [{ userId: OWNER, templateKind: "studio", templateId: row.id, source: "owner" }]);
  });

  it("prefers the live design the kit sent, still stripped", async () => {
    const live = { ...danaLayout, templateId: "modern-minimal", basics: danaContent.basics };
    const row = await publishAs(OWNER, { videoScript: live });
    assert.equal((row.videoScript as { templateId: string }).templateId, "modern-minimal");
    assert.deepEqual(leaks(row.videoScript), []);
  });

  it("refuses anyone but the résumé's owner — and writes nothing", async () => {
    await assert.rejects(publishAs(STRANGER), isCode("FORBIDDEN"));
    assert.equal(templates.rows.length, 0);
    assert.equal(templates.licenses.length, 0);
  });

  it("404s an unknown résumé", async () => {
    await assert.rejects(publishAs(OWNER, { sourceResumeId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }), isCode("NOT_FOUND"));
  });

  it("rejects a design with nothing to wear", async () => {
    await assert.rejects(publishAs(OWNER, { videoScript: { basics: danaContent.basics } }), isCode("VALIDATION_ERROR"));
    assert.equal(templates.rows.length, 0);
  });

  it("names exactly one source", async () => {
    await assert.rejects(
      svc.publish({ creatorUserId: OWNER, sourceResumeId: RESUME_ID, sourceProjectId: RESUME_ID, name: "Both", priceCents: 0 }),
      isCode("VALIDATION_ERROR"),
    );
    await assert.rejects(svc.publish({ creatorUserId: OWNER, name: "Neither", priceCents: 0 }), isCode("VALIDATION_ERROR"));
  });
});

describe("publish a résumé document from a STUDIO PROJECT", () => {
  const PROJECT_ID = "5c4b3a29-1807-4f6e-9d5c-4b3a29180765";

  it("takes the same strict strip — no headshot src, no contact text", async () => {
    const projectTemplates = new FakeTemplates();
    const projectSvc = new StudioTemplatesService({
      db: {} as unknown as DbHandle,
      now: () => at,
      repos: {
        studioTemplates: projectTemplates as unknown as IStudioTemplatesRepository,
        media: {
          findStudioProjectById: async (id: string) =>
            id === PROJECT_ID
              ? { userId: OWNER, mediaKind: "document", companyId: null, state: danaLayout, storyboard: null }
              : null,
        },
        resumes: { findById: async () => null },
      },
    });
    const row = await projectSvc.publish({ creatorUserId: OWNER, sourceProjectId: PROJECT_ID, name: "From the studio", priceCents: 0 });
    assert.equal(row.documentKind, "resume");
    assert.equal(row.sourceProjectId, PROJECT_ID);
    assert.deepEqual(leaks(row.videoScript), []);
    const json = JSON.stringify(row.videoScript);
    assert.equal(json.includes("dana-headshot.jpg"), false);
    assert.equal(json.includes("dana.okafor@gmail.com"), false);
  });
});

// ─── Public-listing gate: the Templates program (#891) ──────────────────────

describe("public publish — gated on the Templates program (legacy Video still counts)", () => {
  /** A service whose creator lookup answers with `creator` (null = not enrolled). */
  const gatedSvc = (creator: TemplatePublishingFlags | null) => {
    const gatedTemplates = new FakeTemplates();
    const service = new StudioTemplatesService({
      db: {} as unknown as DbHandle,
      now: () => at,
      findActiveCreator: async (userId) => (userId === OWNER ? creator : null),
      repos: {
        studioTemplates: gatedTemplates as unknown as IStudioTemplatesRepository,
        media: { findStudioProjectById: async () => null },
        resumes: {
          findById: async (id: string) => (id === RESUME_ID ? { userId: OWNER, content: danaContent } : null),
        },
      },
    });
    return { service, gatedTemplates };
  };

  const publishPublic = (service: StudioTemplatesService) =>
    service.publish({
      creatorUserId: OWNER,
      sourceResumeId: RESUME_ID,
      name: "Clinical Blue, my way",
      priceCents: 499,
      visibility: "public",
      consentAccepted: true,
    });

  it("a templates-only creator can publish publicly", async () => {
    const { service } = gatedSvc({ templatesActive: true, videoActive: false });
    const row = await publishPublic(service);
    assert.equal(row.visibility, "public");
    assert.ok(row.listingSlug);
    assert.equal(row.publishedAt?.toISOString(), at.toISOString());
  });

  it("a video-only creator can still publish publicly (no backfill needed)", async () => {
    const { service } = gatedSvc({ templatesActive: false, videoActive: true });
    const row = await publishPublic(service);
    assert.equal(row.visibility, "public");
  });

  it("a creator with neither program is refused with PROGRAM_NOT_ACTIVE — and writes nothing", async () => {
    const { service, gatedTemplates } = gatedSvc({ templatesActive: false, videoActive: false });
    await assert.rejects(publishPublic(service), isCode("PROGRAM_NOT_ACTIVE"));
    assert.equal(gatedTemplates.rows.length, 0);
    assert.equal(gatedTemplates.licenses.length, 0);
  });

  it("a user with no active enrollment is refused with NOT_A_CREATOR", async () => {
    const { service } = gatedSvc(null);
    await assert.rejects(publishPublic(service), isCode("NOT_A_CREATOR"));
  });

  it("the same gate guards the private→public transition (assertCreatorTemplatesActive)", async () => {
    await gatedSvc({ templatesActive: true, videoActive: false }).service.assertCreatorTemplatesActive(OWNER);
    await assert.rejects(
      gatedSvc({ templatesActive: false, videoActive: false }).service.assertCreatorTemplatesActive(OWNER),
      isCode("PROGRAM_NOT_ACTIVE"),
    );
  });

  it("private drafts skip the gate entirely", async () => {
    const { service } = gatedSvc(null);
    const row = await service.publish({ creatorUserId: OWNER, sourceResumeId: RESUME_ID, name: "Draft", priceCents: 0 });
    assert.equal(row.visibility, "private");
  });
});
