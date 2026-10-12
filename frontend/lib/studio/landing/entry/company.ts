/** `?editCompany=<id>` — open a company page on the document canvas (#1915). */
import { companyService } from "@/lib/services/company-service";
import { createBoundDocumentState } from "@/lib/studio/editor-v2/document-state";
import { documentEditEntry } from "./document";

export const companyEditEntry = documentEditEntry("company", async (id, { t }) => {
  const company = await companyService.getCompanyProfileById(id);
  return {
    name: company.data.name || t("labels.studioLanding.companyFallbackName"),
    documentState: createBoundDocumentState("company", id, () => crypto.randomUUID()),
  };
});
