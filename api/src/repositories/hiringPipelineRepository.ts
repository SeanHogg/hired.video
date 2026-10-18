/**
 * HiringPipelineRepository — post-sourcing recruiter/candidate flow.
 *
 * Covers the "candidate is being evaluated / hired / onboarded"
 * pipeline:
 *   • interviewSessions         — scheduled interview sessions
 *   • offerLetters              — offer drafts + signed offers
 *   • availabilitySlots         — candidate availability windows
 *   • scheduledEvents           — calendar events synced out
 *   • skillAssessments          — assessment definitions
 *   • assessmentAttempts        — candidate attempts of an assessment
 *   • onboardingChecklists      — new-hire onboarding checklists
 *   • onboardingTasks           — individual onboarding tasks
 *
 * Separate from CompaniesRepository because this is the "evaluation →
 * hire → onboard" pipeline (post-sourcing), whereas Companies
 * is "who owns this company profile + candidate pool + search scores"
 * (pre-interview). Recruiter workflows cleanly straddle both via the
 * CompanyService aggregate module.
 */

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  interviewSessions,
  offerLetters,
  availabilitySlots,
  scheduledEvents,
  skillAssessments,
  assessmentAttempts,
  onboardingChecklists,
  onboardingTasks,
} = schema;

export type DbLike = any;

export type InterviewSessionRow = typeof interviewSessions.$inferSelect;
export type InterviewSessionInsert = typeof interviewSessions.$inferInsert;
export type OfferLetterRow = typeof offerLetters.$inferSelect;
export type OfferLetterInsert = typeof offerLetters.$inferInsert;
export type AvailabilitySlotRow = typeof availabilitySlots.$inferSelect;
export type AvailabilitySlotInsert = typeof availabilitySlots.$inferInsert;
export type ScheduledEventRow = typeof scheduledEvents.$inferSelect;
export type ScheduledEventInsert = typeof scheduledEvents.$inferInsert;
export type SkillAssessmentRow = typeof skillAssessments.$inferSelect;
export type AssessmentAttemptRow = typeof assessmentAttempts.$inferSelect;
export type AssessmentAttemptInsert = typeof assessmentAttempts.$inferInsert;
export type OnboardingChecklistRow = typeof onboardingChecklists.$inferSelect;
export type OnboardingTaskRow = typeof onboardingTasks.$inferSelect;
export type OnboardingTaskInsert = typeof onboardingTasks.$inferInsert;

/** Interview sessions. */
export interface IInterviewSessionRepository {
  findInterviewById(id: string): Promise<InterviewSessionRow | null>;
  findInterviewsForCandidate(candidateUserId: string): Promise<InterviewSessionRow[]>;
  insertInterview(input: InterviewSessionInsert): Promise<InterviewSessionRow>;
}

/** Offer letters. */
export interface IOfferLetterRepository {
  findOfferById(id: string): Promise<OfferLetterRow | null>;
  findOffersForCandidate(candidateUserId: string): Promise<OfferLetterRow[]>;
  insertOffer(input: OfferLetterInsert): Promise<OfferLetterRow>;
}

/** Availability + calendar. */
export interface IAvailabilityRepository {
  findAvailabilityForUser(userId: string): Promise<AvailabilitySlotRow[]>;
  insertAvailabilitySlot(input: AvailabilitySlotInsert): Promise<void>;
  insertScheduledEvent(input: ScheduledEventInsert): Promise<ScheduledEventRow>;
  /** Insert one availability window and return the stored row. */
  createAvailabilitySlot(input: AvailabilitySlotInsert): Promise<AvailabilitySlotRow>;
  /** Delete a window the user owns; false when no such row is theirs. */
  deleteAvailabilitySlotForUser(id: string, userId: string): Promise<boolean>;
  /** The user's events starting in [from, to], soonest first, capped at `limit`. */
  findScheduledEventsForUser(userId: string, range: { from: Date; to: Date; limit: number }): Promise<ScheduledEventRow[]>;
  findScheduledEventForUser(id: string, userId: string): Promise<ScheduledEventRow | null>;
  /** Patch an event the user owns (one UPDATE … RETURNING); null when not theirs. */
  updateScheduledEventForUser(id: string, userId: string, patch: Partial<ScheduledEventInsert>): Promise<ScheduledEventRow | null>;
  /** Delete an event the user owns; false when no such row is theirs. */
  deleteScheduledEventForUser(id: string, userId: string): Promise<boolean>;
  /** Events not yet pushed to an external calendar (sync push batch). */
  findUnsyncedScheduledEventsForUser(userId: string, limit: number): Promise<ScheduledEventRow[]>;
}

/** Skill assessments + attempts. */
export interface IAssessmentAttemptRepository {
  findAssessmentById(id: string): Promise<SkillAssessmentRow | null>;
  findAttemptsForUser(userId: string): Promise<AssessmentAttemptRow[]>;
  insertAssessmentAttempt(input: AssessmentAttemptInsert): Promise<AssessmentAttemptRow>;
}

/** Onboarding checklists + tasks. */
export interface IOnboardingRepository {
  findOnboardingChecklistsForCandidate(candidateUserId: string): Promise<OnboardingChecklistRow[]>;
  findOnboardingTasksForChecklist(checklistId: string): Promise<OnboardingTaskRow[]>;
  insertOnboardingTask(input: OnboardingTaskInsert): Promise<void>;
  markOnboardingTaskComplete(id: string, completedByUserId: string): Promise<void>;
}

export interface IHiringPipelineRepository
  extends IInterviewSessionRepository,
    IOfferLetterRepository,
    IAvailabilityRepository,
    IAssessmentAttemptRepository,
    IOnboardingRepository {}

export class HiringPipelineRepository implements IHiringPipelineRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findInterviewById(id: string): Promise<InterviewSessionRow | null> {
    const [row] = await this.db.select().from(interviewSessions).where(eq(interviewSessions.id, id)).limit(1);
    return (row as InterviewSessionRow) ?? null;
  }

  async findInterviewsForCandidate(candidateUserId: string): Promise<InterviewSessionRow[]> {
    // interviewSessions is keyed by the *user taking* the interview
    // (the candidate in the recruiter-side flow; the seeker practising
    // in the self-service flow). Column is plain `userId`.
    return (await this.db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, candidateUserId))
      .orderBy(desc(interviewSessions.createdAt))) as InterviewSessionRow[];
  }

  async insertInterview(input: InterviewSessionInsert): Promise<InterviewSessionRow> {
    const [row] = await this.db.insert(interviewSessions).values(input as any).returning();
    return row as InterviewSessionRow;
  }

  /** The user's most recent completed interview (practice) sessions. */
  async findRecentCompletedInterviewsForUser(
    userId: string,
    limit: number,
  ): Promise<Array<{ id: string; overallScore: string | null; createdAt: Date }>> {
    return (await this.db
      .select({ id: interviewSessions.id, overallScore: interviewSessions.overallScore, createdAt: interviewSessions.createdAt })
      .from(interviewSessions)
      .where(and(eq(interviewSessions.userId, userId), eq(interviewSessions.status, "completed")))
      .orderBy(desc(interviewSessions.createdAt))
      .limit(limit)) as Array<{ id: string; overallScore: string | null; createdAt: Date }>;
  }

  async findOfferById(id: string): Promise<OfferLetterRow | null> {
    const [row] = await this.db.select().from(offerLetters).where(eq(offerLetters.id, id)).limit(1);
    return (row as OfferLetterRow) ?? null;
  }

  async findOffersForCandidate(candidateUserId: string): Promise<OfferLetterRow[]> {
    return (await this.db
      .select()
      .from(offerLetters)
      .where(eq(offerLetters.candidateUserId, candidateUserId))
      .orderBy(desc(offerLetters.createdAt))) as OfferLetterRow[];
  }

  async insertOffer(input: OfferLetterInsert): Promise<OfferLetterRow> {
    const [row] = await this.db.insert(offerLetters).values(input as any).returning();
    return row as OfferLetterRow;
  }

  async findAvailabilityForUser(userId: string): Promise<AvailabilitySlotRow[]> {
    return (await this.db
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.userId, userId))) as AvailabilitySlotRow[];
  }

  async insertAvailabilitySlot(input: AvailabilitySlotInsert): Promise<void> {
    await this.db.insert(availabilitySlots).values(input as any);
  }

  async insertScheduledEvent(input: ScheduledEventInsert): Promise<ScheduledEventRow> {
    const [row] = await this.db.insert(scheduledEvents).values(input as any).returning();
    return row as ScheduledEventRow;
  }

  async createAvailabilitySlot(input: AvailabilitySlotInsert): Promise<AvailabilitySlotRow> {
    const [row] = await this.db.insert(availabilitySlots).values(input).returning();
    return row as AvailabilitySlotRow;
  }

  async deleteAvailabilitySlotForUser(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(availabilitySlots)
      .where(and(eq(availabilitySlots.id, id), eq(availabilitySlots.userId, userId)))
      .returning({ id: availabilitySlots.id });
    return rows.length > 0;
  }

  async findScheduledEventsForUser(
    userId: string,
    range: { from: Date; to: Date; limit: number },
  ): Promise<ScheduledEventRow[]> {
    return (await this.db
      .select()
      .from(scheduledEvents)
      .where(and(
        eq(scheduledEvents.userId, userId),
        gte(scheduledEvents.startAt, range.from),
        lte(scheduledEvents.startAt, range.to),
      ))
      .orderBy(scheduledEvents.startAt)
      .limit(range.limit)) as ScheduledEventRow[];
  }

  async findScheduledEventForUser(id: string, userId: string): Promise<ScheduledEventRow | null> {
    const [row] = await this.db
      .select()
      .from(scheduledEvents)
      .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, userId)))
      .limit(1);
    return (row as ScheduledEventRow) ?? null;
  }

  async updateScheduledEventForUser(
    id: string,
    userId: string,
    patch: Partial<ScheduledEventInsert>,
  ): Promise<ScheduledEventRow | null> {
    const [row] = await this.db
      .update(scheduledEvents)
      .set(patch)
      .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, userId)))
      .returning();
    return (row as ScheduledEventRow) ?? null;
  }

  async deleteScheduledEventForUser(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(scheduledEvents)
      .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, userId)))
      .returning({ id: scheduledEvents.id });
    return rows.length > 0;
  }

  async findUnsyncedScheduledEventsForUser(userId: string, limit: number): Promise<ScheduledEventRow[]> {
    return (await this.db
      .select()
      .from(scheduledEvents)
      .where(and(eq(scheduledEvents.userId, userId), eq(scheduledEvents.syncedToCalendar, false)))
      .limit(limit)) as ScheduledEventRow[];
  }

  async findAssessmentById(id: string): Promise<SkillAssessmentRow | null> {
    const [row] = await this.db.select().from(skillAssessments).where(eq(skillAssessments.id, id)).limit(1);
    return (row as SkillAssessmentRow) ?? null;
  }

  async findAttemptsForUser(userId: string): Promise<AssessmentAttemptRow[]> {
    return (await this.db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.userId, userId))
      .orderBy(desc(assessmentAttempts.createdAt))) as AssessmentAttemptRow[];
  }

  async insertAssessmentAttempt(input: AssessmentAttemptInsert): Promise<AssessmentAttemptRow> {
    const [row] = await this.db.insert(assessmentAttempts).values(input as any).returning();
    return row as AssessmentAttemptRow;
  }

  async findOnboardingChecklistsForCandidate(candidateUserId: string): Promise<OnboardingChecklistRow[]> {
    return (await this.db
      .select()
      .from(onboardingChecklists)
      .where(eq(onboardingChecklists.candidateUserId, candidateUserId))) as OnboardingChecklistRow[];
  }

  async findOnboardingTasksForChecklist(checklistId: string): Promise<OnboardingTaskRow[]> {
    return (await this.db
      .select()
      .from(onboardingTasks)
      .where(eq(onboardingTasks.checklistId, checklistId))) as OnboardingTaskRow[];
  }

  async insertOnboardingTask(input: OnboardingTaskInsert): Promise<void> {
    await this.db.insert(onboardingTasks).values(input as any);
  }

  async markOnboardingTaskComplete(id: string, completedByUserId: string): Promise<void> {
    await this.db
      .update(onboardingTasks)
      .set({ isCompleted: true, completedAt: this.now(), completedByUserId } as any)
      .where(eq(onboardingTasks.id, id));
  }

  // `and` pinned for future combined filters on interview status + date.
  private readonly _andPinned = and;
}
