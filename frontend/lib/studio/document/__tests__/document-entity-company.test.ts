/**
 * #1915 — a company document reads and writes the company profile row:
 * the first named save creates the company and binds it; later saves
 * update it; an unnamed draft creates nothing; a failed read seeds blank.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const company = vi.hoisted(() => ({
  getCompanyProfileById: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
}));
vi.mock("@/lib/services/company-service", () => ({ companyService: company }));

import { createBlankDocumentState, createBoundDocumentState } from "../../editor-v2/document-state";
import type { DocumentEntityContent } from "../../editor-v2/document-state";
import { emptyDocumentContent, loadDocumentEntity, persistDocumentEntity } from "../document-entity";
import { emptyCompanyContent } from "../company-content";

const COMPANY_ID = "c7a1e5d3-2b4f-4a6c-8e9d-0f1a2b3c4d5e";
let n = 0;
const ids = () => `id-${++n}`;
const asContent = (c: object) => c as unknown as DocumentEntityContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("company document entity", () => {
  it("a fresh company draft opens on a blank profile with the company sections", () => {
    const state = createBlankDocumentState("company", ids);
    expect(state.pages[0].blocks.map((b) => b.sectionKey)).toEqual([
      "overview",
      "culture",
      "benefits",
      "mission",
      "contact",
      "headquarters",
    ]);
    expect(emptyDocumentContent("company")).toEqual(emptyCompanyContent());
  });

  it("loads the bound company's profile as canvas content", async () => {
    company.getCompanyProfileById.mockResolvedValue({
      id: COMPANY_ID,
      data: { name: "Northwind Labs", industry: "Fintech", headquarters: { city: "Toronto" }, benefits: { freeFood: true } },
    });
    const loaded = await loadDocumentEntity(createBoundDocumentState("company", COMPANY_ID, ids));
    expect(loaded?.content).toMatchObject({ name: "Northwind Labs", city: "Toronto", benefits: ["freeFood"] });
  });

  it("an unreadable company falls back to a blank record (error case)", async () => {
    company.getCompanyProfileById.mockRejectedValue(new Error("404"));
    expect(await loadDocumentEntity(createBoundDocumentState("company", COMPANY_ID, ids))).toBeNull();
  });

  it("the first named save creates the company and binds the document to it", async () => {
    company.createCompany.mockResolvedValue({ id: COMPANY_ID });
    const state = createBlankDocumentState("company", ids);
    const saved = await persistDocumentEntity(state, asContent({ ...emptyCompanyContent(), name: "Northwind Labs" }), "x");
    expect(company.createCompany).toHaveBeenCalledWith(expect.objectContaining({ name: "Northwind Labs" }));
    expect(saved.entityId).toBe(COMPANY_ID);
  });

  it("an unnamed draft saves as a document only (boundary)", async () => {
    const state = createBlankDocumentState("company", ids);
    const saved = await persistDocumentEntity(state, asContent(emptyCompanyContent()), "Untitled");
    expect(company.createCompany).not.toHaveBeenCalled();
    expect(saved).toBe(state);
  });

  it("a bound company is updated in place", async () => {
    company.updateCompany.mockResolvedValue({ id: COMPANY_ID });
    const state = createBoundDocumentState("company", COMPANY_ID, ids);
    const saved = await persistDocumentEntity(state, asContent({ ...emptyCompanyContent(), name: "Northwind", size: "51-200" }), "x");
    expect(company.updateCompany).toHaveBeenCalledWith(COMPANY_ID, expect.objectContaining({ name: "Northwind", size: "51-200" }));
    expect(saved).toBe(state);
  });
});
