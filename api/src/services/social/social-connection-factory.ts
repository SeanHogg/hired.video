/**
 * The one place a request-scoped SocialConnectionService is assembled
 * (repos over the shared DB + the KMS env). Routes and use cases call this
 * instead of re-wiring `new SocialConnectionService(buildRepos(getDb()), …)`.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { SocialConnectionService, type SocialEnv } from "./social-connection-service.js";

export function socialConnectionServiceFor(env: SocialEnv | undefined): SocialConnectionService {
  const e = (env ?? process.env) as SocialEnv;
  return new SocialConnectionService(buildRepos(getDb()), {
    SOCIAL_KMS_KEY: e.SOCIAL_KMS_KEY,
    PAID_MEDIA_KMS_KEY: e.PAID_MEDIA_KMS_KEY,
  });
}
