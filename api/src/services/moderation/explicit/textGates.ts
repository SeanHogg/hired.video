/**
 * Save-time explicit gates for short public text:
 *
 *   profile                 the name + headline the home wall's cards show
 *                           (PUT /api/users/me)
 *   video_personalization   the "own words" sentence woven into videos
 *                           (PUT /api/video-personalization)
 *
 * A `block` verdict rejects the save (ExplicitContentError → 422 naming the
 * categories, never the text). `unscreened` (classifier down) saves — private
 * use is never blocked — but is recorded, so the wall can fail closed on it.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { userProfiles, users } from "../../../db/schema/users.js";
import { ownerStatusOf, type ExplicitVerdict } from "../../../../../shared/moderation/explicit.js";
import { sha256Hex } from "./bytes.js";
import { getScan, upsertScan } from "./contentScanRepository.js";
import { ExplicitContentError } from "./errors.js";
import { scanTextExplicit } from "./textScan.js";
import { createExplicitScanDeps, type ExplicitScanDeps, type ExplicitScanEnv } from "./deps.js";

type TextSubject = "profile" | "video_personalization";

/**
 * Scan `text` for the user's `subject`, persist the verdict, and throw on a
 * block. Unchanged text (same hash, final verdict) is not rescanned.
 */
export async function assertPublicTextAllowed(
  args: { subject: TextSubject; userId: string; text: string },
  deps: Pick<ExplicitScanDeps, "classifyText">,
): Promise<ExplicitVerdict> {
  const text = args.text.trim();
  const inputHash = await sha256Hex(text);
  const existing = await getScan(args.subject, args.userId);
  let verdict: ExplicitVerdict;
  if (existing && existing.inputHash === inputHash && existing.verdict !== "unscreened") {
    verdict = { ...ownerStatusOf(existing), reason: existing.reason };
  } else {
    verdict = await scanTextExplicit(text, deps.classifyText);
    await upsertScan({ subjectType: args.subject, subjectId: args.userId, ownerUserId: args.userId, verdict, inputHash });
  }
  if (verdict.verdict === "block") throw new ExplicitContentError(verdict.categories);
  return verdict;
}

/**
 * Route-facing wrapper: builds the deps from the env and only lets an
 * ExplicitContentError through — a scan infrastructure failure (DB down,
 * classifier crash) never blocks the save.
 */
export async function guardPublicText(
  args: { subject: TextSubject; userId: string; text: string },
  env: ExplicitScanEnv | undefined,
): Promise<void> {
  if (!args.text.trim()) return;
  try {
    await assertPublicTextAllowed(args, createExplicitScanDeps(env));
  } catch (err) {
    if (err instanceof ExplicitContentError) throw err;
    console.error(`[explicit-scan] ${args.subject} text scan failed:`, err instanceof Error ? err.message : err);
  }
}

/**
 * PUT /api/users/me: the wall card shows the name AND the headline, so the
 * pair is scanned together — the changed field(s) merged over the saved ones.
 */
export async function guardProfileWallText(
  args: { userId: string; name?: string; headline?: string | null },
  env: ExplicitScanEnv | undefined,
): Promise<void> {
  if (args.name === undefined && args.headline === undefined) return;
  const current = await getDb()
    .select({ name: users.name, headline: userProfiles.headline })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, args.userId))
    .limit(1)
    .then((rows) => rows[0] ?? null)
    .catch(() => null);
  const name = args.name ?? current?.name ?? "";
  const headline = args.headline !== undefined ? args.headline : current?.headline ?? null;
  await guardPublicText({ subject: "profile", userId: args.userId, text: [name, headline].filter(Boolean).join("\n") }, env);
}
