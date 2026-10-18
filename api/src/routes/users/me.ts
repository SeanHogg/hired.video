/**
 * `/api/users` self-service + directory endpoints — every STATIC path, so
 * this router is mounted before the `/:id` profile router:
 *   GET /public · GET|PUT /me · GET /me/recommendations · POST /me/avatar ·
 *   PATCH /slug · GET /check-slug/:slug · DELETE /account
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { parsePagination } from "../../utils/pagination.js";
import { MB, parseUpload, isUploadRejected } from "../../utils/multipart.js";
import { listPublicUsers } from "../../services/user/publicProfile.js";
import { UpdateProfileSchema, getMyProfile, updateMyProfile } from "../../services/user/myProfile.js";
import {
  UpdateSlugSchema,
  checkSlugAvailability,
  deleteMyAccount,
  updateMySlug,
  uploadMyAvatar,
} from "../../services/user/accountSelfService.js";
import { respond, validationError, waitUntilOf } from "./http.js";
import { validateJson } from "../helpers/validate.js";

export const meRoutes = new Hono<AppEnv>();

/** GET /api/users/public — list public users (optional auth). Every field the
 *  PeopleCard needs; only public (or profile-less) verified, active,
 *  non-confidential candidates. */
meRoutes.get("/public", async (c) => {
  const { page, limit } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
  return c.json(success(await listPublicUsers(page, limit, c.req.query("fields"))));
});

/** GET /api/users/me — frontend compatibility endpoint */
meRoutes.get("/me", (c) => respond(c, getMyProfile(c.var.userId)));

/** PUT /api/users/me — update authenticated user's profile. Role + email
 *  guards live in the use case (services/user/myProfile.ts). */
meRoutes.put("/me", validateJson(UpdateProfileSchema, (e, c) => validationError(c, "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const user = c.var.user;
  return respond(
    c,
    updateMyProfile({
      userId: user.sub,
      sessionEmail: user.email,
      input: body,
      env: c.env,
      waitUntil: waitUntilOf(c),
    }),
  );
});

/** GET /api/users/me/recommendations */
meRoutes.get("/me/recommendations", (c) => c.json(success([]), 200));

const AVATAR_MAX_BYTES = 5 * MB;
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** POST /api/users/me/avatar — upload a new avatar (5MB, jpg/png/gif/webp only) */
meRoutes.post("/me/avatar", async (c) => {
  const up = await parseUpload(c, {
    fields: ["avatar", "file"],
    mimes: AVATAR_ALLOWED_TYPES,
    maxBytes: AVATAR_MAX_BYTES,
    messages: {
      missing: "Missing avatar file in form field 'avatar'",
      type: (contentType) => `Only jpg, png, gif, and webp images are allowed. Got: ${contentType}`,
      size: (fileBytes) => `Avatar must be under 5 MB. File is ${(fileBytes / MB).toFixed(1)} MB`,
    },
  });
  if (isUploadRejected(up)) {
    // 400 missing / 415 wrong type stay VALIDATION_ERROR; 413 is PAYLOAD_TOO_LARGE.
    return c.json(error(up.code === "PAYLOAD_TOO_LARGE" ? up.code : "VALIDATION_ERROR", up.message), up.status);
  }
  return respond(
    c,
    uploadMyAvatar({
      userId: c.var.userId,
      fileName: up.file.name,
      bytes: up.bytes,
      contentType: up.contentType,
      waitUntil: waitUntilOf(c),
    }),
  );
});

/** PATCH /api/users/slug — update the authenticated user's custom URL slug */
meRoutes.patch("/slug", validateJson(UpdateSlugSchema, (e, c) => validationError(c, "Invalid slug", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return respond(c, updateMySlug(c.var.userId, body.slug));
});

/** GET /api/users/check-slug/:slug — check if a slug is available (no auth required) */
meRoutes.get("/check-slug/:slug", (c) =>
  respond(c, checkSlugAvailability(c.req.param("slug"), c.var.userId)),
);

/** DELETE /api/users/account — permanently delete the authenticated user's account */
meRoutes.delete("/account", (c) => respond(c, deleteMyAccount(c.var.userId)));
