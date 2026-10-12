/**
 * A document's bound entity (#1916/#1920/#1914). Its layout (DocumentState)
 * persists on the studio project; its CONTENT lives in the entity's own
 * system — the job posting, the company profile or an `articles` row. This
 * is the one place the studio reads and writes that content. Résumés are read
 * and written by the kit workspace only; a résumé document redirects there
 * (#2311).
 */
import { jobService } from "@/lib/services/job-service";
import { articleService } from "@/lib/services/article-service";
import { companyService } from "@/lib/services/company-service";
import { USER_ROLES } from "@shared/user-roles";
import { locationsService } from "@/lib/services/locations-service";
import { getEmptyResumeData } from "@/lib/resume-shape";
import type {
  DocumentEntityContent,
  DocumentEntityKind,
  DocumentState,
} from "@/lib/studio/editor-v2/document-state";
import {
  contentToCreateJob,
  contentToUpdateJob,
  emptyJobContent,
  jobItemToContent,
  type JobDocumentContent,
} from "./job-content";
import { documentToArticle } from "./document-to-article";
import {
  companyDataToContent,
  contentToCompanyFields,
  contentToCreateCompany,
  emptyCompanyContent,
  type CompanyDocumentContent,
} from "./company-content";

/** Blank content for a fresh draft — resume → empty JSON-Resume, job → the
 *  default posting, company → a blank profile; article/blog author free
 *  blocks, so no bound content. */
export function emptyDocumentContent(kind: DocumentEntityKind): DocumentEntityContent {
  if (kind === "job") return emptyJobContent() as unknown as DocumentEntityContent;
  if (kind === "company") return emptyCompanyContent() as unknown as DocumentEntityContent;
  if (kind === "resume") return getEmptyResumeData() as unknown as DocumentEntityContent;
  return {};
}

/** Who is seeding a fresh draft — for the employer's company prefill. */
export interface DocumentSeedViewer {
  role?: string | null;
  currentCompany?: string | null;
}

/** Blank content for a fresh draft, personalised where the retired forms did:
 *  an EMPLOYER's new job posting starts with their company filled in (their
 *  profile's company, else the first company they own). Never throws. */
export async function seedDocumentContent(
  kind: DocumentEntityKind,
  viewer: DocumentSeedViewer | null,
): Promise<DocumentEntityContent> {
  const blank = emptyDocumentContent(kind);
  if (kind !== "job" || viewer?.role !== USER_ROLES.EMPLOYER) return blank;
  const company =
    viewer.currentCompany?.trim() ||
    (await companyService
      .getMyCompanies()
      .then((list) => list[0]?.name?.trim() ?? "")
      .catch(() => ""));
  return company ? ({ ...blank, company } as DocumentEntityContent) : blank;
}

export interface LoadedDocumentEntity {
  content: DocumentEntityContent;
}

/** Read the bound entity's content; null when there's no row or it can't
 *  be read (the caller seeds a blank record). */
export async function loadDocumentEntity(
  documentState: DocumentState,
): Promise<LoadedDocumentEntity | null> {
  const { entityId, entityKind } = documentState;
  if (!entityId) return null;
  try {
    if (entityKind === "job") {
      // Geo tags live in content_locations; a failed read leaves them
      // undefined, so a save never overwrites them blind.
      const [job, locations] = await Promise.all([
        jobService.getJobById(entityId),
        locationsService.getSetForEntity("job", entityId).catch(() => undefined),
      ]);
      const content: JobDocumentContent = { ...jobItemToContent(job), ...(locations ? { locations } : {}) };
      return { content: content as unknown as DocumentEntityContent };
    }
    if (entityKind === "company") {
      const company = await companyService.getCompanyProfileById(entityId);
      return { content: companyDataToContent(company.data) as unknown as DocumentEntityContent };
    }
  } catch {
    // Unreadable row — fall back to a blank document.
  }
  return null;
}

/** Write the content to its entity row, creating it on the first save.
 *  Returns the DocumentState to persist (with `entityId` stamped when a row
 *  was created). Throws on a failed write; the caller reports it. */
export async function persistDocumentEntity(
  documentState: DocumentState,
  content: DocumentEntityContent | null,
  title: string,
): Promise<DocumentState> {
  const bind = (entityId: string): DocumentState => ({ ...documentState, entityId });

  if (documentState.entityKind === "job" && content) {
    // The canvas content IS the job posting record (editable fields plus
    // passthrough publishing config).
    const job = content as unknown as JobDocumentContent;
    // Structured geo tags ride beside the row (content_locations), as the
    // retired JobCreatePage wrote them after its save.
    const saveLocations = (id: string) =>
      job.locations ? locationsService.setForEntity("job", id, job.locations) : Promise.resolve();
    if (documentState.entityId) {
      await jobService.updateJob(documentState.entityId, contentToUpdateJob(job));
      await saveLocations(documentState.entityId);
      return documentState;
    }
    // CreateJobSchema needs a title and a description — a draft without them
    // persists as a document only until it has both.
    if (!job.title.trim() || !job.description.trim()) return documentState;
    const created = await jobService.createJob(contentToCreateJob(job));
    await saveLocations(created.id);
    return bind(created.id);
  }

  if (documentState.entityKind === "company" && content) {
    // The canvas content IS the company profile (flattened — company-content).
    const company = content as unknown as CompanyDocumentContent;
    if (documentState.entityId) {
      await companyService.updateCompany(documentState.entityId, contentToCompanyFields(company));
      return documentState;
    }
    const create = contentToCreateCompany(company);
    if (!create) return documentState;
    const created = await companyService.createCompany(create);
    return bind(created.id);
  }

  if (documentState.entityKind === "article" || documentState.entityKind === "blog") {
    // The canvas blocks are the source: derive a title + markdown body.
    const { title: derivedTitle, bodyMd } = documentToArticle(documentState);
    const articleTitle = derivedTitle || title;
    if (documentState.entityId) {
      // The blocks are now the source: clear the Tiptap JSON so the bespoke
      // editor and the renderer read the markdown just written, never a stale
      // pre-canvas copy (the canvas opened from that JSON — tiptap-to-blocks).
      await articleService.update(documentState.entityId, { title: articleTitle, bodyMd, bodyJson: null });
      return documentState;
    }
    const created = await articleService.create({ title: articleTitle, bodyMd, kind: "article" });
    return bind(created.id);
  }

  return documentState;
}
