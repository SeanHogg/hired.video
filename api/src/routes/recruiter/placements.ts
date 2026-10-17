/**
 * /api/recruiter placements: create (+bulk #225), back-office edit (#229),
 * split-aware commission summary + splits (#228), commission and
 * guarantee status. /placements/summary/commission is registered before
 * /placements/:id so the static segment wins.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import {
  announcePlacementSigned,
  createPlacement,
  createPlacementsBulk,
  getPlacement,
  listPlacements,
  updateCommissionStatus,
  updateGuaranteeStatus,
  updatePlacementBackOffice,
} from "../../services/recruiter/placements.js";
import {
  getCommissionSummary,
  getPlacementSplits,
  replacePlacementSplits,
} from "../../services/recruiter/placement-commission.js";
import { handle, responseEnvelope } from "./http.js";

export const placementRoutes = new Hono<AppEnv>();

/** 404 body shared by every owner-scoped placement read/write. */
const notFound = () => responseEnvelope(null);

// GET /placements/summary/commission — must be before /:id
placementRoutes.get("/placements/summary/commission", async (c) => {
  return c.json(responseEnvelope(await getCommissionSummary(c.get("user").sub)));
});

// POST /placements — record a placement
placementRoutes.post("/placements", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const placement = await createPlacement(user.sub, body);
  // #1118 — a placement is the highest-value recruiter action; award it.
  // RefId = placement id keeps it idempotent. Best-effort.
  await withGamification(c, "candidate-placed", (game, role, uidEarner) =>
    game.onCandidatePlaced({ userId: uidEarner, role, placementId: placement.id }),
  );
  // #230 — subscribe the owner + fire `signed` (best-effort).
  await announcePlacementSigned(placement.id, user.sub);
  return c.json(responseEnvelope(placement));
});

// PUT /placements/:id — edit the back-office axis (#229), owner-scoped.
placementRoutes.put("/placements/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const updated = await updatePlacementBackOffice(user.sub, id, body);
  if (!updated) return c.json(notFound(), 404);
  return c.json(responseEnvelope(updated));
});

// POST /placements/bulk — #225 N placements in one round-trip (all-or-nothing)
placementRoutes.post("/placements/bulk", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  return handle(c, "bare", async () => c.json(responseEnvelope(await createPlacementsBulk(user.sub, body))));
});

// GET /placements — list all placements for current recruiter
placementRoutes.get("/placements", async (c) => {
  return c.json(responseEnvelope(await listPlacements(c.get("user").sub)));
});

// GET /placements/:id — single placement
placementRoutes.get("/placements/:id", async (c) => {
  const row = await getPlacement(c.get("user").sub, c.req.param("id"));
  if (!row) return c.json(notFound(), 404);
  return c.json(responseEnvelope(row));
});

// GET /placements/:id/splits — the split rows (owner only)
placementRoutes.get("/placements/:id/splits", async (c) => {
  const rows = await getPlacementSplits(c.get("user").sub, c.req.param("id"));
  if (!rows) return c.json(notFound(), 404);
  return c.json(responseEnvelope(rows));
});

// PUT /placements/:id/splits — replace-all (owner only). Empty clears;
// non-empty must total 100%.
placementRoutes.put("/placements/:id/splits", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  return handle(c, "bare", async () => {
    const rows = await replacePlacementSplits(user.sub, id, body);
    if (!rows) return c.json(notFound(), 404);
    return c.json(responseEnvelope(rows));
  });
});

// PUT /placements/:id/commission — update commission status
placementRoutes.put("/placements/:id/commission", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const updated = await updateCommissionStatus(user.sub, id, body);
  if (!updated) return c.json(notFound(), 404);
  return c.json(responseEnvelope(updated));
});

// PUT /placements/:id/guarantee — update guarantee status (#230 notifies on met)
placementRoutes.put("/placements/:id/guarantee", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const updated = await updateGuaranteeStatus(user.sub, id, body);
  if (!updated) return c.json(notFound(), 404);
  return c.json(responseEnvelope(updated));
});
