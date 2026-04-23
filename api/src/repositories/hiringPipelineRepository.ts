/**
 * HiringPipelineRepository — post-sourcing recruiter/candidate flow.
 *
 * Covers the "candidate is being evaluated / hired / onboarded"
 * pipeline:
 *   • interviewSessions         — scheduled interview sessions
 *   • offerLetters              — offer drafts + signed offers
 *   • availabilitySlots         — candidate availability windows
 *   • calendarConnections       — Google/Outlook calendar links
 *   • scheduledEvents           — calendar events synced out
 *   • skillAssessments          — assessment definitions
 *   • assessmentAttempts        — candidate attempts of an assessment
 *   • performanceReviews        — post-hire review cycles
 *   • performanceGoals          — post-hire goals
 *   • onboardingChecklists      — new-hire onboarding checklists
 *   • onboardingTasks           — individual onboarding tasks
 *
 * Separate from CompaniesRepository because this is the "evaluation →
 * hire → onboard → review" pipeline (post-sourcing), whereas Companies
 * is "who owns this company profile + candidate pool + search scores"
 * (pre-interview). Recruiter workflows cleanly straddle both via the
 * CompanyService aggregate module.
 */

import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  interviewSessions,
  offerLetters,
  availabilitySlots,
  calendarConnections,
  scheduledEvents,
  skillAssessments,
  assessmentAttempts,
  performanceReviews,
  performanceGoals,
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
export type CalendarConnectionRow = typeof calendarConnections.$inferSelect;
export type CalendarConnectionInsert = typeof calendarConnections.$inferInsert;
export type ScheduledEventRow = typeof scheduledEvents.$inferSelect;
export type ScheduledEventInsert = typeof scheduledEvents.$inferInsert;
export type SkillAssessmentRow = typeof skillAssessments.$inferSelect;
export type AssessmentAttemptRow = typeof assessmentAttempts.$inferSelect;
export type AssessmentAttemptInsert = typeof assessmentAttempts.$inferInsert;
export type PerformanceReviewRow = typeof performanceReviews.$inferSelect;
export type PerformanceGoalRow = typeof performanceGoals.$inferSelect;
export type OnboardingChecklistRow = typeof onboardingChecklists.$inferSelect;
export type OnboardingTaskRow = typeof onboardingTasks.$inferSelect;
export type OnboardingTaskInsert = typeof onboardingTasks.$inferInsert;

export interface IHiringPipelineRepository {
  // interviews
  findInterviewById(id: string): Promise<InterviewSessionRow | null>;
  findInterviewsForCandidate(candidateUserId: string): Promise<InterviewSessionRow[]>;
  insertInterview(input: InterviewSessionInsert): Promise<InterviewSessionRow>;
  // offers
  findOfferById(id: string): Promise<OfferLetterRow | null>;
  findOffersForCandidate(candidateUserId: string): Promise<OfferLetterRow[]>;
  insertOffer(input: OfferLetterInsert): Promise<OfferLetterRow>;
  // availability + calendar
  findAvailabilityForUser(userId: string): Promise<AvailabilitySlotRow[]>;
  insertAvailabilitySlot(input: AvailabilitySlotInsert): Promise<void>;
  findCalendarConnectionsForUser(userId: string): Promise<CalendarConnectionRow[]>;
  insertCalendarConnection(input: CalendarConnectionInsert): Promise<void>;
  insertScheduledEvent(input: ScheduledEventInsert): Promise<ScheduledEventRow>;
  // assessments
  findAssessmentById(id: string): Promise<SkillAssessmentRow | null>;
  findAttemptsForUser(userId: string): Promise<AssessmentAttemptRow[]>;
  insertAssessmentAttempt(input: AssessmentAttemptInsert): Promise<AssessmentAttemptRow>;
  // performance
  findPerformanceReviewsForUser(userId: string): Promise<PerformanceReviewRow[]>;
  findPerformanceGoalsForUser(userId: string): Promise<PerformanceGoalRow[]>;
  // onboarding
  findOnboardingChecklistsForCandidate(candidateUserId: string): Promise<OnboardingChecklistRow[]>;
  findOnboardingTasksForChecklist(checklistId: string): Promise<OnboardingTaskRow[]>;
  insertOnboardingTask(input: OnboardingTaskInsert): Promise<void>;
  markOnboardingTaskComplete(id: string, completedByUserId: string): Promise<void>;
}

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

  async findCalendarConnectionsForUser(userId: string): Promise<CalendarConnectionRow[]> {
    return (await this.db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, userId))) as CalendarConnectionRow[];
  }

  async insertCalendarConnection(input: CalendarConnectionInsert): Promise<void> {
    await this.db.insert(calendarConnections).values(input as any);
  }

  async insertScheduledEvent(input: ScheduledEventInsert): Promise<ScheduledEventRow> {
    const [row] = await this.db.insert(scheduledEvents).values(input as any).returning();
    return row as ScheduledEventRow;
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

  async findPerformanceReviewsForUser(userId: string): Promise<PerformanceReviewRow[]> {
    // performanceReviews keys by `revieweeUserId` (the person being reviewed)
    // not `userId`. The same row also has a `reviewerUserId` for the author —
    // callers that want the latter should add a dedicated finder.
    return (await this.db
      .select()
      .from(performanceReviews)
      .where(eq(performanceReviews.revieweeUserId, userId))) as PerformanceReviewRow[];
  }

  async findPerformanceGoalsForUser(userId: string): Promise<PerformanceGoalRow[]> {
    return (await this.db
      .select()
      .from(performanceGoals)
      .where(eq(performanceGoals.userId, userId))) as PerformanceGoalRow[];
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
