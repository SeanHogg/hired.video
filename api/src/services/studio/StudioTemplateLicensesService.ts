/**
 * StudioTemplateLicensesService — who may use which template.
 *
 * `template_licenses` is the ONE license ledger. Every creator template —
 * video, podcast, résumé, job… — is a `studio_templates` row and is granted
 * as ('studio', <studio_templates.id>). A résumé template is no exception:
 * it is a studio template with document_kind = 'resume' (mig 0520).
 * Built-in presets (the résumé descriptors and the studio catalog) are free
 * and need no grant.
 *
 * Split out of StudioTemplatesService (publish/edit/read) so each stays
 * focused; routes call this for claim / purchase / ownership reads.
 */

import { isUuid } from "../../../../shared/value-types.js";
import type {
  IStudioTemplatesRepository,
  LicensedStudioTemplateRow,
  StudioTemplateRow,
  TemplateKind,
  TemplateLicenseRow,
} from "../../repositories/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getDb } from "../../db/index.js";
import type { GrantableTemplateKind } from "../../db/schema/studiotemplates.js";
import { PLATFORM_FEE_BPS_DEFAULT, StudioTemplatesError } from "./studioTemplatesErrors.js";

export interface StudioTemplateLicensesDeps {
  repos: { studioTemplates: IStudioTemplatesRepository };
}

export interface GrantPurchaseInput {
  userId: string;
  kind: GrantableTemplateKind;
  /** studio_templates.id, or its listing slug (older carts carried the
   *  slug) — recorded under the canonical id either way. Descriptor id for
   *  'job'. */
  templateId: string;
  pricePaidCents: number;
  paymentRef?: string | null;
}

export class StudioTemplateLicensesService {
  private readonly repo: IStudioTemplatesRepository;

  constructor(deps?: Partial<StudioTemplateLicensesDeps>) {
    this.repo = deps?.repos?.studioTemplates ?? buildRepos(getDb()).studioTemplates;
  }

  /** The studio template a license names — by id, else by listing slug. */
  async resolveTemplate(idOrSlug: string): Promise<StudioTemplateRow | null> {
    if (isUuid(idOrSlug)) {
      const byId = await this.repo.findById(idOrSlug);
      if (byId) return byId;
    }
    return this.repo.findBySlug(idOrSlug);
  }

  /** Grants a free license — the public listing must currently be free
   *  (priceCents === 0). Idempotent. */
  async claimFree(userId: string, templateId: string): Promise<TemplateLicenseRow> {
    const t = await this.resolveTemplate(templateId);
    if (!t) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
    if (t.visibility !== "public") {
      throw new StudioTemplatesError("FORBIDDEN", "Template is not publicly listed.");
    }
    if (t.priceCents > 0) {
      throw new StudioTemplatesError("VALIDATION_ERROR", "This template requires purchase.");
    }
    const existing = await this.repo.findLicense(userId, "studio", t.id);
    if (existing) return existing;
    const created = await this.repo.insertLicense({
      userId,
      templateKind: "studio",
      templateId: t.id,
      source: "free",
    });
    return created ?? (await this.mustFindLicense(userId, "studio", t.id));
  }

  /** Records a paid license. Snapshots the fee split from the listing's
   *  stored `platformFeeBps`. Idempotent — duplicate fulfilment calls
   *  return the existing row. */
  async grantPurchase(input: GrantPurchaseInput): Promise<TemplateLicenseRow> {
    let templateId = input.templateId;
    let feeBps = PLATFORM_FEE_BPS_DEFAULT;
    if (input.kind === "studio") {
      const t = await this.resolveTemplate(input.templateId);
      if (!t) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
      templateId = t.id;
      feeBps = t.platformFeeBps;
    }

    const existing = await this.repo.findLicense(input.userId, input.kind, templateId);
    if (existing) return existing;

    const platformCutCents = Math.round((input.pricePaidCents * feeBps) / 10000);
    const row = await this.repo.insertLicense({
      userId: input.userId,
      templateKind: input.kind,
      templateId,
      source: "purchase",
      pricePaidCents: input.pricePaidCents,
      creatorCutCents: input.pricePaidCents - platformCutCents,
      platformCutCents,
      paymentRef: input.paymentRef ?? null,
    });

    if (input.kind === "studio" && row) {
      await this.repo.incrementPurchaseCount(templateId);
    }
    // onConflictDoNothing returned null → a concurrent call already granted
    // it; return that row so the caller still gets a 200 shape.
    return row ?? (await this.mustFindLicense(input.userId, input.kind, templateId));
  }

  listLicensesForUser(userId: string): Promise<TemplateLicenseRow[]> {
    return this.repo.findLicensesForUser(userId);
  }

  /** Studio templates the user claimed (`free`) or bought (`purchase`) —
   *  owner licenses excluded (those mirror the creator's own list). */
  listLicensedStudioTemplatesForUser(userId: string): Promise<LicensedStudioTemplateRow[]> {
    return this.repo.findLicensedStudioTemplatesForUser(userId);
  }

  async hasLicense(userId: string, kind: TemplateKind, templateId: string): Promise<boolean> {
    return Boolean(await this.repo.findLicense(userId, kind, templateId));
  }

  private async mustFindLicense(userId: string, kind: TemplateKind, templateId: string): Promise<TemplateLicenseRow> {
    const row = await this.repo.findLicense(userId, kind, templateId);
    if (!row) throw new StudioTemplatesError("NOT_FOUND", "License not found.");
    return row;
  }
}
