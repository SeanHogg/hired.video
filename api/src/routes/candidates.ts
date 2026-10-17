// candidates.ts — composition root for the agency recruiting surface
// (gap #99), mounted at /api/recruit; plus the public résumé share view
// mounted at /api/public/candidate-resume (no auth middleware).
//
// NOTE: /api/recruit (agency candidate résumé variants, redaction, shares,
// pitch decks) is a distinct feature from /api/recruiter (recruiter CRM in
// recruiter.ts); the two prefixes share no paths — keep both.
//
// Sub-routers (routes/candidates/*, full paths, order preserved):
//   • candidate-resumes.ts  — /my-scope, /candidates CRUD, /candidates/bulk-csv,
//                             /candidates/:id/activate
//   • redaction-profiles.ts — /redaction-profiles CRUD
//   • shares.ts             — /shares CRUD + the public /:token view
//   • http.ts               — body-parse + use-case → envelope helpers
// Use cases: services/recruit/*; data: repositories/candidateResumesRepository,
// redactionProfilesRepository, candidateResumeSharesRepository,
// recruitBrandingRepository. Pitch decks live in pitch-decks.ts.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { candidateResumeRoutes } from "./candidates/candidate-resumes.js";
import { redactionProfileRoutes } from "./candidates/redaction-profiles.js";
import { candidateShareRoutes, candidateResumePublicShareRoutes } from "./candidates/shares.js";

export const candidatesRoutes = new Hono<AppEnv>();
candidatesRoutes.route("/", candidateResumeRoutes);
candidatesRoutes.route("/", redactionProfileRoutes);
candidatesRoutes.route("/", candidateShareRoutes);

/** GET /api/public/candidate-resume/:token — unauthenticated reviewer view. */
export const candidateResumePublicRoutes = new Hono<AppEnv>();
candidateResumePublicRoutes.route("/", candidateResumePublicShareRoutes);
