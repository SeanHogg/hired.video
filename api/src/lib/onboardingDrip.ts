/**
 * Freemium activation / onboarding email drip (#59)
 *
 * On user registration, enroll the new user in the system onboarding sequence.
 * The sequence is looked up by the reserved name "__onboarding__" owned by the
 * system (userId = null is not allowed, so we use the user's own id as sender).
 *
 * If no system onboarding sequence exists, this function creates one with three
 * default steps:
 *   Step 1 (day 0)  — Welcome: complete your profile
 *   Step 2 (day 3)  — Your first job match
 *   Step 3 (day 7)  — Upgrade to Premium
 *
 * The enrollment is then processed by the scheduled() cron in scheduled.ts.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const SYSTEM_SEQUENCE_NAME = "__onboarding__";

async function getOrCreateOnboardingSequence(systemUserId: string): Promise<string> {
  const db = getDb();

  // Look for an existing system-owned onboarding sequence
  const [existing] = await db
    .select({ id: schema.followUpSequences.id })
    .from(schema.followUpSequences)
    .where(and(
      eq(schema.followUpSequences.name, SYSTEM_SEQUENCE_NAME),
      eq(schema.followUpSequences.userId, systemUserId),
      eq(schema.followUpSequences.isActive, true),
    ))
    .limit(1);

  if (existing) return existing.id;

  // Create the sequence + steps in a single transaction-like batch
  const [seq] = await db
    .insert(schema.followUpSequences)
    .values({
      userId: systemUserId,
      name: SYSTEM_SEQUENCE_NAME,
      description: "Default freemium activation drip — 3 emails over 7 days",
      isActive: true,
    } as any)
    .returning();

  await db.insert(schema.followUpSteps).values([
    {
      sequenceId: seq.id,
      stepOrder: 1,
      delayDays: 0,
      subject: "Welcome to hired.video — let's get you hired 🎯",
      bodyTemplate: `Hi {{name}},

Welcome to hired.video! You're one step away from landing your next opportunity.

👤 Complete your profile — recruiter engagement increases 3× with a photo and headline.
📄 Build your resume — our AI builder takes 5 minutes.
🎥 Record your video intro — it gets 10× more clicks than a text resume.

Head to your dashboard to get started: {{dashboardUrl}}

— The hired.video team`,
      channel: "email",
    },
    {
      sequenceId: seq.id,
      stepOrder: 2,
      delayDays: 3,
      subject: "Your first job matches are waiting",
      bodyTemplate: `Hi {{name}},

Based on your profile we've already found relevant opportunities for you.

Search jobs on hired.video and use filters to narrow down by salary, location, and remote. Your AI-matched score shows how well each role fits your experience.

See your matches: {{jobsUrl}}

— The hired.video team`,
      channel: "email",
    },
    {
      sequenceId: seq.id,
      stepOrder: 3,
      delayDays: 7,
      subject: "Unlock AI Resume Optimizer — get more callbacks",
      bodyTemplate: `Hi {{name}},

Free users get 10 AI requests per month. Premium users get unlimited — including:

✅ AI Resume Optimizer (tailored to each job)
✅ Salary Analyzer
✅ ATS compatibility score
✅ Priority visibility to recruiters

Upgrade for less than a coffee a day: {{upgradeUrl}}

— The hired.video team`,
      channel: "email",
    },
  ] as any);

  return seq.id;
}

/**
 * Called from the registration route (fire-and-forget via waitUntil).
 * Looks up or creates the system onboarding sequence, then enrolls the new user.
 * No-op if the sequence can't be found or created (never throws).
 */
export async function triggerOnboardingDrip(
  userId: string,
  email: string,
  name: string | null,
  _role: string,
): Promise<void> {
  const db = getDb();

  // Prevent duplicate enrollments (e.g. re-registration after email change)
  const sequenceId = await getOrCreateOnboardingSequence(userId).catch(() => null);
  if (!sequenceId) return;

  // Check for existing enrollment
  const [existing] = await db
    .select({ id: schema.followUpEnrollments.id })
    .from(schema.followUpEnrollments)
    .where(and(
      eq(schema.followUpEnrollments.sequenceId, sequenceId),
      eq(schema.followUpEnrollments.recipientEmail, email),
    ))
    .limit(1);

  if (existing) return; // already enrolled

  const baseUrl = (globalThis as any).__ENV?.FRONTEND_URL || process.env.FRONTEND_URL || "https://hired.video";

  await db.insert(schema.followUpEnrollments).values({
    sequenceId,
    userId,
    recipientEmail: email,
    recipientName: name ?? email.split("@")[0],
    recipientUserId: userId,
    status: "active",
    currentStep: 0,
    nextSendAt: new Date(), // first email sent immediately on next cron tick
    context: {
      trigger: "signup",
      dashboardUrl: `${baseUrl}/dashboard`,
      jobsUrl: `${baseUrl}/jobs`,
      upgradeUrl: `${baseUrl}/settings/billing`,
    } as any,
  } as any);
}
