/**
 * Conformant xAPI 1.0.3 LRS REST surface (mig 0490).
 *
 * Mounted at `/api/learning/xapi/lrs` (canonical, shown to users as the LRS
 * endpoint) AND at `/api/xapi` (alias kept for external xAPI tools configured
 * with the original endpoint — see app.ts). Both prefixes are in
 * PUBLIC_PREFIXES so the platform JWT layer skips them — this surface
 * authenticates with its OWN LRS Basic-auth credential (see
 * services/learning/lrs-service.ts), exactly like SCORM Cloud.
 *
 * Unlike the rest of the API, responses are RAW xAPI documents (StatementResult,
 * statement arrays, document bytes) — NOT the platform `{ data, error }`
 * envelope — because external xAPI tools expect spec-shaped bodies. Every
 * response carries `X-Experience-API-Version: 1.0.3`.
 *
 * Endpoints (xAPI Communication):
 *   GET  /about
 *   PUT|POST|GET               /statements
 *   PUT|POST|GET|DELETE        /activities/state       (+ GET list w/o stateId)
 *   PUT|POST|GET|DELETE        /activities/profile     (+ GET list w/o profileId)
 *   PUT|POST|GET|DELETE        /agents/profile         (+ GET list w/o profileId)
 *   GET  /activities            (canonical activity object)
 *   GET  /agents                (Person object)
 */
import { Hono } from "hono";
import type { Variables, AppEnv } from "../../../types/index.js";
import {
  resolveLrsBasicAuth,
  LrsAuthError,
  actorIfi,
  storeStatements,
  queryStatements,
  putDocument,
  getDocument,
  deleteDocument,
  listDocumentKeys,
  aboutDocument,
  LRS_XAPI_VERSION,
  type ResolvedLrsCredential,
  type DocumentKey,
} from "../../../services/learning/lrs-service.js";
import { clampLimit } from "../../../utils/pagination.js";

type LrsDocumentType = DocumentKey["docType"];

export const xapiLrsRoutes = new Hono<{ Variables: Variables } & AppEnv>();

// Stamp the xAPI version header on every response.
xapiLrsRoutes.use("*", async (c, next) => {
  await next();
  c.header("X-Experience-API-Version", LRS_XAPI_VERSION);
});

/** Resolve Basic auth or return a spec-shaped error Response (thrown). */
async function auth(c: any, mode: "read" | "write"): Promise<ResolvedLrsCredential> {
  try {
    return await resolveLrsBasicAuth(c.req.header("Authorization"), mode);
  } catch (e) {
    if (e instanceof LrsAuthError) {
      throw new Response(JSON.stringify({ error: e.code, message: e.message }), {
        status: e.status,
        headers: { "Content-Type": "application/json", "X-Experience-API-Version": LRS_XAPI_VERSION },
      });
    }
    throw e;
  }
}

/** Turn a thrown Response back into a Hono response; rethrow anything else. */
function asResponse(e: unknown): Response {
  if (e instanceof Response) return e;
  throw e;
}

// ── About (unauthenticated) ─────────────────────────────────────────────────
xapiLrsRoutes.get("/about", (c) => c.json(aboutDocument(), 200));

// ── Statements ──────────────────────────────────────────────────────────────
xapiLrsRoutes.put("/statements", async (c) => {
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "write"); } catch (e) { return asResponse(e); }
  const statementId = c.req.query("statementId");
  if (!statementId) return c.json({ error: "MISSING_PARAM", message: "statementId query param is required for PUT." }, 400);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "INVALID_BODY", message: "A single statement is required." }, 400);
  const raw = { ...(body as Record<string, unknown>), id: statementId };
  try {
    await storeStatements(cred, [raw]);
    return c.body(null, 204);
  } catch (e) {
    if (e instanceof LrsAuthError) return c.json({ error: e.code, message: e.message }, e.status as never);
    throw e;
  }
});

xapiLrsRoutes.post("/statements", async (c) => {
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "write"); } catch (e) { return asResponse(e); }
  const body = await c.req.json().catch(() => null);
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : null;
  if (!list) return c.json({ error: "INVALID_BODY", message: "A statement or array of statements is required." }, 400);
  try {
    const { ids } = await storeStatements(cred, list as Record<string, unknown>[]);
    return c.json(ids, 200);
  } catch (e) {
    if (e instanceof LrsAuthError) return c.json({ error: e.code, message: e.message }, e.status as never);
    throw e;
  }
});

xapiLrsRoutes.get("/statements", async (c) => {
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "read"); } catch (e) { return asResponse(e); }
  const q = c.req.query();
  let agentIfi: string | undefined;
  if (q.agent) {
    try { agentIfi = actorIfi(JSON.parse(q.agent)); } catch { return c.json({ error: "INVALID_PARAM", message: "agent must be a JSON Agent object." }, 400); }
  }
  const { result, single } = await queryStatements(cred, {
    statementId: q.statementId,
    voidedStatementId: q.voidedStatementId,
    agent: agentIfi,
    verb: q.verb,
    activity: q.activity,
    registration: q.registration,
    since: q.since,
    until: q.until,
    // Same default/bounds the LRS service applies (100, 1..500).
    limit: clampLimit(q.limit, 100, 500),
    ascending: q.ascending === "true",
  });
  // Single-statement lookup returns the bare statement; list returns the
  // StatementResult envelope.
  if ((q.statementId || q.voidedStatementId)) {
    if (!single) return c.json({ error: "NOT_FOUND", message: "Statement not found." }, 404);
    return c.json(single, 200);
  }
  return c.json(result, 200);
});

// ── Document resources — shared handlers ────────────────────────────────────
// State, Activity Profile, and Agent Profile are the same CRUD shape over
// different key components. One set of handlers, keyed by docType, keeps this
// DRY (the three route groups below just supply the key builder).

async function parseAgentIfi(c: any): Promise<string | null> {
  const agent = c.req.query("agent");
  if (!agent) return null;
  try { return actorIfi(JSON.parse(agent)); } catch { return null; }
}

async function handleDocPut(c: any, docType: LrsDocumentType, key: Omit<DocumentKey, "docType">): Promise<Response> {
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "write"); } catch (e) { return asResponse(e); }
  const content = await c.req.text();
  const contentType = c.req.header("Content-Type") ?? "application/octet-stream";
  // POST merges JSON documents; PUT replaces.
  const merge = c.req.method === "POST";
  const { etag } = await putDocument(cred.credentialId, { docType, ...key }, content, contentType, merge);
  c.header("ETag", `"${etag}"`);
  return c.body(null, 204);
}

async function handleDocGet(c: any, docType: LrsDocumentType, key: Omit<DocumentKey, "docType">): Promise<Response> {
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "read"); } catch (e) { return asResponse(e); }
  const doc = await getDocument(cred.credentialId, { docType, ...key });
  if (!doc) return c.json({ error: "NOT_FOUND", message: "Document not found." }, 404);
  c.header("Content-Type", doc.contentType);
  c.header("ETag", `"${doc.etag}"`);
  c.header("Last-Modified", doc.updatedAt.toUTCString());
  return c.body(doc.content, 200);
}

async function handleDocDelete(c: any, docType: LrsDocumentType, key: Omit<DocumentKey, "docType">): Promise<Response> {
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "write"); } catch (e) { return asResponse(e); }
  await deleteDocument(cred.credentialId, { docType, ...key });
  return c.body(null, 204);
}

// ── Activity State (activities/state) ───────────────────────────────────────
for (const method of ["put", "post"] as const) {
  xapiLrsRoutes[method]("/activities/state", async (c) => {
    const agentIfi = await parseAgentIfi(c);
    const stateId = c.req.query("stateId");
    if (!c.req.query("activityId") || agentIfi === null || !stateId) {
      return c.json({ error: "MISSING_PARAM", message: "activityId, agent, and stateId are required." }, 400);
    }
    return handleDocPut(c, "state", { activityId: c.req.query("activityId"), agentIfi, registration: c.req.query("registration") ?? "", documentKey: stateId });
  });
}

xapiLrsRoutes.get("/activities/state", async (c) => {
  const agentIfi = await parseAgentIfi(c);
  const activityId = c.req.query("activityId");
  if (!activityId || agentIfi === null) return c.json({ error: "MISSING_PARAM", message: "activityId and agent are required." }, 400);
  const stateId = c.req.query("stateId");
  if (stateId) return handleDocGet(c, "state", { activityId, agentIfi, registration: c.req.query("registration") ?? "", documentKey: stateId });
  // List form: return the array of stateIds in scope.
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "read"); } catch (e) { return asResponse(e); }
  const ids = await listDocumentKeys(cred.credentialId, "state", {
    activityId, agentIfi, registration: c.req.query("registration") ?? "", since: c.req.query("since"),
  });
  return c.json(ids, 200);
});

xapiLrsRoutes.delete("/activities/state", async (c) => {
  const agentIfi = await parseAgentIfi(c);
  const activityId = c.req.query("activityId");
  if (!activityId || agentIfi === null) return c.json({ error: "MISSING_PARAM", message: "activityId and agent are required." }, 400);
  const stateId = c.req.query("stateId");
  // No stateId → clear all state docs for (activity, agent, registration).
  if (!stateId) {
    let cred: ResolvedLrsCredential;
    try { cred = await auth(c, "write"); } catch (e) { return asResponse(e); }
    const ids = await listDocumentKeys(cred.credentialId, "state", { activityId, agentIfi, registration: c.req.query("registration") ?? "" });
    await Promise.all(ids.map((id) => deleteDocument(cred.credentialId, { docType: "state", activityId, agentIfi, registration: c.req.query("registration") ?? "", documentKey: id })));
    return c.body(null, 204);
  }
  return handleDocDelete(c, "state", { activityId, agentIfi, registration: c.req.query("registration") ?? "", documentKey: stateId });
});

// ── Activity Profile (activities/profile) ───────────────────────────────────
for (const method of ["put", "post"] as const) {
  xapiLrsRoutes[method]("/activities/profile", async (c) => {
    const activityId = c.req.query("activityId");
    const profileId = c.req.query("profileId");
    if (!activityId || !profileId) return c.json({ error: "MISSING_PARAM", message: "activityId and profileId are required." }, 400);
    return handleDocPut(c, "activity_profile", { activityId, documentKey: profileId });
  });
}

xapiLrsRoutes.get("/activities/profile", async (c) => {
  const activityId = c.req.query("activityId");
  if (!activityId) return c.json({ error: "MISSING_PARAM", message: "activityId is required." }, 400);
  const profileId = c.req.query("profileId");
  if (profileId) return handleDocGet(c, "activity_profile", { activityId, documentKey: profileId });
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "read"); } catch (e) { return asResponse(e); }
  const ids = await listDocumentKeys(cred.credentialId, "activity_profile", { activityId, since: c.req.query("since") });
  return c.json(ids, 200);
});

xapiLrsRoutes.delete("/activities/profile", async (c) => {
  const activityId = c.req.query("activityId");
  const profileId = c.req.query("profileId");
  if (!activityId || !profileId) return c.json({ error: "MISSING_PARAM", message: "activityId and profileId are required." }, 400);
  return handleDocDelete(c, "activity_profile", { activityId, documentKey: profileId });
});

// ── Agent Profile (agents/profile) ──────────────────────────────────────────
for (const method of ["put", "post"] as const) {
  xapiLrsRoutes[method]("/agents/profile", async (c) => {
    const agentIfi = await parseAgentIfi(c);
    const profileId = c.req.query("profileId");
    if (agentIfi === null || !profileId) return c.json({ error: "MISSING_PARAM", message: "agent and profileId are required." }, 400);
    return handleDocPut(c, "agent_profile", { agentIfi, documentKey: profileId });
  });
}

xapiLrsRoutes.get("/agents/profile", async (c) => {
  const agentIfi = await parseAgentIfi(c);
  if (agentIfi === null) return c.json({ error: "MISSING_PARAM", message: "agent is required." }, 400);
  const profileId = c.req.query("profileId");
  if (profileId) return handleDocGet(c, "agent_profile", { agentIfi, documentKey: profileId });
  let cred: ResolvedLrsCredential;
  try { cred = await auth(c, "read"); } catch (e) { return asResponse(e); }
  const ids = await listDocumentKeys(cred.credentialId, "agent_profile", { agentIfi, since: c.req.query("since") });
  return c.json(ids, 200);
});

xapiLrsRoutes.delete("/agents/profile", async (c) => {
  const agentIfi = await parseAgentIfi(c);
  const profileId = c.req.query("profileId");
  if (agentIfi === null || !profileId) return c.json({ error: "MISSING_PARAM", message: "agent and profileId are required." }, 400);
  return handleDocDelete(c, "agent_profile", { agentIfi, documentKey: profileId });
});

// ── Activities / Agents (canonical lookups) ─────────────────────────────────
xapiLrsRoutes.get("/activities", async (c) => {
  try { await auth(c, "read"); } catch (e) { return asResponse(e); }
  const activityId = c.req.query("activityId");
  if (!activityId) return c.json({ error: "MISSING_PARAM", message: "activityId is required." }, 400);
  // We don't maintain a canonical activity profile registry yet — echo the id
  // as a minimal Activity object (spec-valid).
  return c.json({ objectType: "Activity", id: activityId }, 200);
});

xapiLrsRoutes.get("/agents", async (c) => {
  try { await auth(c, "read"); } catch (e) { return asResponse(e); }
  const agent = c.req.query("agent");
  if (!agent) return c.json({ error: "MISSING_PARAM", message: "agent is required." }, 400);
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(agent); } catch { return c.json({ error: "INVALID_PARAM", message: "agent must be a JSON Agent object." }, 400); }
  // Person object: echo the single known IFI back (we don't merge identities).
  const person: Record<string, unknown> = { objectType: "Person" };
  for (const k of ["name", "mbox", "mbox_sha1sum", "openid", "account"] as const) {
    if (parsed[k] !== undefined) person[k] = Array.isArray(parsed[k]) ? parsed[k] : [parsed[k]];
  }
  return c.json(person, 200);
});
