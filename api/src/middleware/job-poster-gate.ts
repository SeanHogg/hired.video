/**
 * Job-posting gate — a tiny module of its own so the jobs route (hot) doesn't
 * pull the billing service in with the Pro gates.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/index.js";
import { canPostJobsRole } from "../../../shared/user-roles.js";
import { error } from "../types/index.js";

type AppCtx = Context<AppEnv>;

/**
 * `requireJobPoster` — only recruiters, employers and internal roles may
 * post a job (`canPostJobsRole`, shared/user-roles.ts — the same rule the
 * studio's job document and `apply_job_draft` gate on). 401 signed out,
 * 403 otherwise. A job SEEKER's tracked job (`/api/jobs/createfromfile`, `/api/jobs/extract`)
 * is not a posting and is not gated.
 */
export const requireJobPoster: MiddlewareHandler<AppEnv> = async (c: AppCtx, next) => {
  const user = c.var.user;
  if (!user?.sub) {
    return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  }
  const roles = [...(user.roles ?? []), (user as { role?: string }).role];
  if (!canPostJobsRole(roles)) {
    return c.json(
      error("FORBIDDEN", "Only recruiters and employers can post jobs"),
      403,
    );
  }
  return next();
};
