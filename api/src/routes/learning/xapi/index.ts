/**
 * /api/learning/xapi — the one xAPI module.
 *
 *   /lrs/*            conformant xAPI 1.0.3 LRS (PUBLIC — LRS Basic-auth, raw
 *                     xAPI bodies). Also mounted at /api/xapi (external alias).
 *   /statements       internal statement ingest from the lesson player (JWT)
 *   /credentials/*    LRS credential management (JWT, owner-scoped)
 *   /targets/*        external LRS forwarding targets (JWT, owner-scoped)
 *   /portability/*    tenant export / import (JWT, owner-scoped)
 *
 * Sub-routers carry their own path segments and mount at "/" so no handler
 * sits at a sub-router root (Hono root-path gotcha).
 */
import { Hono } from "hono";
import type { Variables, AppEnv } from "../../../types/index.js";
import { xapiLrsRoutes } from "./lrs.js";
import { xapiStatementRoutes } from "./statements.js";
import { xapiCredentialRoutes } from "./credentials.js";
import { xapiTargetRoutes } from "./targets.js";
import { xapiPortabilityRoutes } from "./portability.js";

export { xapiLrsRoutes };

export const xapiRoutes = new Hono<{ Variables: Variables } & AppEnv>();

xapiRoutes.route("/lrs", xapiLrsRoutes);
xapiRoutes.route("/", xapiStatementRoutes);
xapiRoutes.route("/", xapiCredentialRoutes);
xapiRoutes.route("/", xapiTargetRoutes);
xapiRoutes.route("/", xapiPortabilityRoutes);
