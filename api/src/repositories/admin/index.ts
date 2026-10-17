/**
 * Repository bundle bound to the request DB handle, for admin / SuperAdmin
 * routes — keeps getDb() out of the route layer.
 */
import { getDb } from "../../db/index.js";
import { buildRepos, type Repos } from "../index.js";
import { WorkerRunsRepository } from "../workerRunsRepository.js";

export function adminRepos(): Repos {
  return buildRepos(getDb());
}

export function workerRunsRepository(): WorkerRunsRepository {
  return new WorkerRunsRepository(getDb());
}
