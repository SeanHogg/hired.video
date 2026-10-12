/**
 * peopleCrud — a CRUD-router factory for the segment-scoped People-Ops
 * surfaces. Collapses the identical list/create/get/update/delete boilerplate
 * (objectives, pulse, syncs, scorecards, workflows, headcount, PTO, …) into
 * one place. Every handler reads `c.var.peopleCtx` (set by peopleOpsContext)
 * and goes through PeopleSegmentRepo, so the (tenant, segment) no-bleed filter
 * is automatic.
 *
 * Options:
 *  - stampCreatedBy: write `created_by = <host user>` on create (NOT-NULL cols).
 *  - employeeRefs: body fields that must reference an in-segment roster
 *    employee (validated before write) — closes the cross-segment FK leak that
 *    a bare FK to people_employees(id) would otherwise allow.
 *  - coerceDates: body fields to `new Date()` before write.
 */

import { Hono } from "hono";
import type { z } from "zod";
import { success, error } from "../../types/index.js";
import type { PeopleEnv } from "../../middleware/peopleOps.js";
import { PeopleSegmentRepo } from "../../repositories/peopleSegmentRepo.js";
import { PeopleEmployeesRepository } from "../../repositories/peopleEmployeesRepository.js";
import { getDb } from "../../db/index.js";

export interface CrudOpts {
  stampCreatedBy?: boolean;
  employeeRefs?: string[];
  coerceDates?: string[];
}

function prep(c: any, data: Record<string, unknown>, opts: CrudOpts): Record<string, unknown> {
  const out = { ...data };
  for (const f of opts.coerceDates ?? []) {
    if (out[f] != null) out[f] = new Date(out[f] as string);
  }
  if (opts.stampCreatedBy) out.createdBy = c.var.user.sub;
  return out;
}

async function assertEmployeeRefs(c: any, data: Record<string, unknown>, opts: CrudOpts): Promise<string | null> {
  if (!opts.employeeRefs?.length) return null;
  const refs = opts.employeeRefs.flatMap((f) => {
    const id = data[f];
    return typeof id === "string" && id ? [{ field: f, id }] : [];
  });
  if (refs.length === 0) return null;
  // ONE inArray lookup for every referenced employee (was one per field).
  const repo = new PeopleEmployeesRepository(getDb());
  const found = new Set(
    (await repo.findManyByIds(c.var.peopleCtx, refs.map((r) => r.id))).map((r) => r.id),
  );
  const missing = refs.find((r) => !found.has(r.id));
  return missing ? `${missing.field} is not an employee on this roster.` : null;
}

export function crudRouter(
  table: any,
  writeSchema: z.ZodTypeAny,
  updateSchema?: z.ZodTypeAny,
  opts: CrudOpts = {},
): Hono<PeopleEnv> {
  const r = new Hono<PeopleEnv>();
  const repo = () => new PeopleSegmentRepo(getDb(), table);

  r.get("/", async (c) => c.json(success(await repo().list(c.var.peopleCtx))));

  r.post("/", async (c) => {
    const p = writeSchema.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
    const data = prep(c, p.data as Record<string, unknown>, opts);
    const refErr = await assertEmployeeRefs(c, data, opts);
    if (refErr) return c.json(error("VALIDATION_ERROR", refErr), 400);
    return c.json(success(await repo().insert(c.var.peopleCtx, data)), 201);
  });

  r.get("/:id", async (c) => {
    const row = await repo().findById(c.var.peopleCtx, c.req.param("id"));
    return row ? c.json(success(row)) : c.json(error("NOT_FOUND", "Not found"), 404);
  });

  r.put("/:id", async (c) => {
    const p = (updateSchema ?? writeSchema).safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json(error("VALIDATION_ERROR", "Invalid body", p.error.flatten()), 400);
    const data = prep(c, p.data as Record<string, unknown>, { ...opts, stampCreatedBy: false });
    const refErr = await assertEmployeeRefs(c, data, opts);
    if (refErr) return c.json(error("VALIDATION_ERROR", refErr), 400);
    const row = await repo().update(c.var.peopleCtx, c.req.param("id"), data);
    return row ? c.json(success(row)) : c.json(error("NOT_FOUND", "Not found"), 404);
  });

  r.delete("/:id", async (c) => {
    const ok = await repo().remove(c.var.peopleCtx, c.req.param("id"));
    return ok ? c.json(success({ deleted: true })) : c.json(error("NOT_FOUND", "Not found"), 404);
  });

  return r;
}
