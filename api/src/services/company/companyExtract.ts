/**
 * Company extraction from page HTML (POST /api/companies/extract):
 *   1. extractCompanyFromHtml — strip HTML → LLM brief (or a stub when no
 *      provider key is configured).
 *   2. mergeIntoExistingCompany — dedup by slug / case-insensitive name and
 *      fill only blank fields on a match.
 *   3. createExtractedCompany — new row (route enforces the cap first).
 */
import { z } from "zod";
import type { Env, JwtPayload } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { slugify } from "../../../../shared/slugify.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import { buildAIErrorEnvelope } from "../adapters/llm-error.js";
import {
  CompaniesRepository,
  type CompanyProfileInsert,
  type CompanyProfileRow,
} from "../../repositories/companiesRepository.js";
import { findCompanyBySlugOrName } from "../../repositories/companyDirectoryRepository.js";

export const ExtractCompanySchema = z.object({
  html: z.string().min(50),
  sourceUrl: z.string().min(1),
});

const CompanyExtractionResponseSchema = z.object({
  name: z.string(),
  industry: z.string().optional().default(""),
  size: z.string().optional().default(""),
  location: z.string().optional().default(""),
  website: z.string().optional().default(""),
  description: z.string().optional().default(""),
  foundedYear: z.number().nullable().optional(),
});

export type ExtractedCompany = z.infer<typeof CompanyExtractionResponseSchema>;

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}

/** AI-extract company details. Throws DomainError carrying the AI upgrade
 *  envelope (#529) when the plan is exhausted, else a generic AI_ERROR. */
export async function extractCompanyFromHtml(
  env: Env,
  user: JwtPayload | undefined,
  html: string,
): Promise<ExtractedCompany> {
  if (!hasAnyLLMProviderKey(env)) {
    return {
      name: "Unknown Company",
      industry: "", size: "", location: "", website: "", description: "", foundedYear: null,
    };
  }
  const plainText = htmlToPlainText(html);
  try {
    const llm = createLLMClient(env, user);
    const { data } = await llm.callJson(
      "company_extract_brief",
      {
        systemPrompt: `You extract company/business information from a web page.
Return valid JSON with the company's details. If a field is not found, use an empty string.`,
        userMessage: `Extract company details from this page:

${plainText}

Return JSON: { "name": "...", "industry": "...", "size": "...", "location": "...", "website": "...", "description": "...", "foundedYear": null }`,
        responseFormat: "json_object",
        useCase: "company_brief",
      },
      CompanyExtractionResponseSchema,
    );
    return data;
  } catch (err) {
    const envelope = buildAIErrorEnvelope(err);
    if (envelope) throw new DomainError(envelope.status, envelope.code, envelope.message, envelope.payload);
    throw new DomainError(500, "AI_ERROR", "Failed to extract company details. Please try again.");
  }
}

/** Dedup: when a company with the derived slug or (case-insensitive) name
 *  exists, fill its blank fields and return the merged response body;
 *  otherwise `merged` is null and `slug` is the slug to create with. */
export async function mergeIntoExistingCompany(extracted: ExtractedCompany) {
  const slug = slugify(extracted.name, { fallback: "", maxLen: 100, stripDiacritics: false });
  const existing: CompanyProfileRow | null = await findCompanyBySlugOrName(slug, extracted.name);
  if (!existing) return { slug, merged: null };

  const updates: Partial<CompanyProfileInsert> = {};
  if (!existing.industry && extracted.industry) updates.industry = extracted.industry;
  if (!existing.size && extracted.size) updates.size = extracted.size;
  if (!existing.headquarters && extracted.location) updates.headquarters = { address: extracted.location };
  if (!existing.website && extracted.website) updates.website = extracted.website;
  if (!existing.description && extracted.description) updates.description = extracted.description;
  if (!existing.foundedYear && extracted.foundedYear) updates.foundedYear = extracted.foundedYear;

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    await new CompaniesRepository(getDb(), () => updates.updatedAt).updateCompanyById(existing.id, updates);
  }

  return {
    slug,
    merged: {
      company: { ...existing, ...updates },
      duplicate: true,
      existingId: existing.id,
    },
  };
}

/** Insert a new company from the extracted brief. */
export async function createExtractedCompany(
  ownerId: string,
  extracted: ExtractedCompany,
  slug: string,
): Promise<CompanyProfileRow> {
  return new CompaniesRepository(getDb()).insertCompany({
    ownerId,
    name: extracted.name,
    slug,
    description: extracted.description || null,
    website: extracted.website || null,
    industry: extracted.industry || null,
    size: extracted.size || null,
    headquarters: extracted.location ? { address: extracted.location } : null,
    foundedYear: extracted.foundedYear ?? null,
  });
}
