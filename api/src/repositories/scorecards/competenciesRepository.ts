/** Competency library persistence (migration 0132 / gap #1382). */

import { and, asc, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { ICompetenciesRepository } from "./interfaces.js";
import type {
  DbLike,
  CompetencyLevelRow,
  CompetencyRow,
  NewCompetency,
  NewCompetencyLevel,
  UpdateCompetencyPatch,
} from "./types.js";

const { competencies, competencyLevels } = schema;

export class CompetenciesRepository implements ICompetenciesRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findCompetencyById(id: string): Promise<CompetencyRow | null> {
    const [row] = await this.db
      .select()
      .from(competencies)
      .where(eq(competencies.id, id))
      .limit(1);
    return (row as CompetencyRow) ?? null;
  }

  async findCompetenciesByIds(ids: readonly string[]): Promise<CompetencyRow[]> {
    if (ids.length === 0) return [];
    return (await this.db
      .select()
      .from(competencies)
      .where(inArray(competencies.id, ids as string[]))) as CompetencyRow[];
  }

  async findActiveCompetenciesForCompanies(
    companyIds: readonly string[],
  ): Promise<CompetencyRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(competencies)
      .where(
        and(
          inArray(competencies.companyId, companyIds as string[]),
          eq(competencies.isArchived, false),
        ),
      )
      .orderBy(asc(competencies.name))) as CompetencyRow[];
  }

  async insertCompetency(input: NewCompetency): Promise<CompetencyRow> {
    const [row] = await this.db.insert(competencies).values(input as any).returning();
    return row as CompetencyRow;
  }

  async updateCompetency(
    id: string,
    patch: UpdateCompetencyPatch,
  ): Promise<CompetencyRow> {
    const [row] = await this.db
      .update(competencies)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(competencies.id, id))
      .returning();
    return row as CompetencyRow;
  }

  async findLevelsForCompetencies(
    competencyIds: readonly string[],
  ): Promise<CompetencyLevelRow[]> {
    if (competencyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(competencyLevels)
      .where(inArray(competencyLevels.competencyId, competencyIds as string[]))
      .orderBy(asc(competencyLevels.level))) as CompetencyLevelRow[];
  }

  async insertCompetencyLevels(
    rows: readonly NewCompetencyLevel[],
  ): Promise<CompetencyLevelRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(competencyLevels)
      .values(rows as any[])
      .returning()) as CompetencyLevelRow[];
  }

  async deleteLevelsForCompetency(competencyId: string): Promise<void> {
    await this.db
      .delete(competencyLevels)
      .where(eq(competencyLevels.competencyId, competencyId));
  }
}
