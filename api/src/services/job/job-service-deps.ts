/** Shared deps slice for the job service modules (raw `db` + repos), so
 *  every module's direct Drizzle calls stay mockable by tests. */
import { getDb } from "../../db/index.js";
import { type ApiDeps, defaultApiDeps } from "../apiDeps.js";

/** Narrow Deps slice. account.ts touches both `users` (via UsersRepository)
 *  and `accountInvitations` (via PlatformRepository) plus assorted
 *  tables without repo surface yet — the raw `db` handle is injected so
 *  all the direct Drizzle calls can still be mocked by tests. */
export interface JobServiceDeps {
  repos: ApiDeps["repos"];
  db: ReturnType<typeof getDb>;
}

export const resolveDeps = (deps?: Partial<JobServiceDeps>): JobServiceDeps => {
  const api = defaultApiDeps();
  return {
    repos: deps?.repos ?? api.repos,
    db: deps?.db ?? getDb(),
  };
};
