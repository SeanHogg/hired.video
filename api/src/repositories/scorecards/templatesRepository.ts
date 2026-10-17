/** Scorecard templates + rubric attributes persistence. */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IScorecardTemplatesRepository } from "./interfaces.js";
import type {
  DbLike,
  NewScorecardAttribute,
  NewScorecardTemplate,
  ScorecardAttributeRow,
  ScorecardTemplateRow,
  UpdateAttributePatch,
  UpdateTemplatePatch,
} from "./types.js";

const { scorecardTemplates, scorecardAttributes } = schema;

export class ScorecardTemplatesRepository implements IScorecardTemplatesRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findTemplateById(id: string): Promise<ScorecardTemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(scorecardTemplates)
      .where(eq(scorecardTemplates.id, id))
      .limit(1);
    return (row as ScorecardTemplateRow) ?? null;
  }

  async findTemplatesByIds(ids: readonly string[]): Promise<ScorecardTemplateRow[]> {
    if (ids.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardTemplates)
      .where(inArray(scorecardTemplates.id, ids as string[]))) as ScorecardTemplateRow[];
  }

  async findActiveTemplatesForCompanies(
    companyIds: readonly string[],
  ): Promise<ScorecardTemplateRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardTemplates)
      .where(
        and(
          inArray(scorecardTemplates.companyId, companyIds as string[]),
          eq(scorecardTemplates.isArchived, false),
        ),
      )
      .orderBy(desc(scorecardTemplates.updatedAt))) as ScorecardTemplateRow[];
  }

  async insertTemplate(input: NewScorecardTemplate): Promise<ScorecardTemplateRow> {
    const [row] = await this.db.insert(scorecardTemplates).values(input as any).returning();
    return row as ScorecardTemplateRow;
  }

  async updateTemplate(id: string, patch: UpdateTemplatePatch): Promise<ScorecardTemplateRow> {
    const [row] = await this.db
      .update(scorecardTemplates)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(scorecardTemplates.id, id))
      .returning();
    return row as ScorecardTemplateRow;
  }

  async findAttributesForTemplate(templateId: string): Promise<ScorecardAttributeRow[]> {
    return (await this.db
      .select()
      .from(scorecardAttributes)
      .where(eq(scorecardAttributes.templateId, templateId))
      .orderBy(asc(scorecardAttributes.displayOrder))) as ScorecardAttributeRow[];
  }

  async findAttributesForTemplates(
    templateIds: readonly string[],
  ): Promise<ScorecardAttributeRow[]> {
    if (templateIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardAttributes)
      .where(inArray(scorecardAttributes.templateId, templateIds as string[]))) as ScorecardAttributeRow[];
  }

  async findAttributeById(id: string): Promise<ScorecardAttributeRow | null> {
    const [row] = await this.db
      .select()
      .from(scorecardAttributes)
      .where(eq(scorecardAttributes.id, id))
      .limit(1);
    return (row as ScorecardAttributeRow) ?? null;
  }

  async insertAttribute(input: NewScorecardAttribute): Promise<ScorecardAttributeRow> {
    const [row] = await this.db.insert(scorecardAttributes).values(input as any).returning();
    return row as ScorecardAttributeRow;
  }

  async insertAttributes(
    rows: readonly NewScorecardAttribute[],
  ): Promise<ScorecardAttributeRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(scorecardAttributes)
      .values(rows as any)
      .returning()) as ScorecardAttributeRow[];
  }

  async updateAttribute(id: string, patch: UpdateAttributePatch): Promise<ScorecardAttributeRow> {
    const [row] = await this.db
      .update(scorecardAttributes)
      .set(patch as any)
      .where(eq(scorecardAttributes.id, id))
      .returning();
    return row as ScorecardAttributeRow;
  }

  async deleteAttribute(id: string): Promise<void> {
    await this.db.delete(scorecardAttributes).where(eq(scorecardAttributes.id, id));
  }
}
