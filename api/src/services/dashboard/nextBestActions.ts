import { count, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
// `meta_resumes` is the one-row-per-resume container (has user_id); a non-zero
// count means the user has at least one resume.
import { metaResumes } from "../../db/schema/resumes.js";

/**
 * AI Next Best Action recommendations (gap #1825).
 *
 * The home dashboard marketed "it tells you what to do next" (daily
 * recommendations / smart reminders / 1-click jump to tools) but
 * `/api/users/me/recommendations` returned an empty array and nothing was
 * rendered. This computes a small, role-aware, rule-based action list from the
 * user's actual state — cheap (a couple of counts), deterministic, and free of
 * LLM cost — so every role's home screen has concrete next steps that deep-link
 * straight to the relevant tool.
 *
 * `icon` is a stable string key the frontend maps to a lucide icon; lower
 * `priority` sorts first.
 */
export interface RecommendationDto {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  url: string;
  icon: string;
  priority: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function jobSeekerActions(userId: string, db: ReturnType<typeof getDb>): Promise<RecommendationDto[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);
  const [resumeRows, applications] = await Promise.all([
    db.select({ n: count() }).from(metaResumes).where(eq(metaResumes.userId, userId)),
    db
      .select({ status: schema.jobApplications.status, appliedAt: schema.jobApplications.appliedAt })
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.userId, userId)),
  ]);

  const resumeCount = resumeRows[0]?.n ?? 0;
  const recentCount = applications.filter((a) => a.appliedAt && new Date(a.appliedAt) >= sevenDaysAgo).length;
  const stalledCount = applications.filter(
    (a) =>
      ["applied", "pending"].includes((a.status ?? "").toLowerCase()) &&
      a.appliedAt &&
      new Date(a.appliedAt) < sevenDaysAgo,
  ).length;

  const actions: RecommendationDto[] = [];

  if (resumeCount === 0) {
    actions.push({
      id: "create-resume",
      title: "Create your resume",
      description: "Build a resume so you can start applying for jobs.",
      actionLabel: "Build resume",
      url: "/resumes",
      icon: "resume",
      priority: 0,
    });
  }

  if (stalledCount > 0) {
    actions.push({
      id: "follow-up-stalled",
      title: `Follow up on ${stalledCount} stalled application${stalledCount === 1 ? "" : "s"}`,
      description: "These have had no response for over a week — a nudge can help.",
      actionLabel: "Review applications",
      url: "/applications",
      icon: "followup",
      priority: 1,
    });
  }

  if (recentCount === 0) {
    actions.push({
      id: "apply-jobs",
      title: "Apply to more jobs",
      description: "You haven't applied this week. Keep your pipeline moving.",
      actionLabel: "Browse jobs",
      url: "/jobs",
      icon: "apply",
      priority: 2,
    });
  }

  // Always-available tool nudges so the card is never empty.
  actions.push({
    id: "tailor-resume",
    title: "Tailor your resume to a job",
    description: "Match your resume to a posting to boost your callback rate.",
    actionLabel: "Open Resume Tailor",
    url: "/tools/resume-tailor",
    icon: "tailor",
    priority: 5,
  });
  actions.push({
    id: "practice-interview",
    title: "Practice an interview",
    description: "Run a quick mock interview and get instant feedback.",
    actionLabel: "Start practice",
    url: "/interview-practice",
    icon: "interview",
    priority: 6,
  });

  return actions;
}

async function recruiterActions(userId: string, db: ReturnType<typeof getDb>): Promise<RecommendationDto[]> {
  const [poolRows, submissions] = await Promise.all([
    db.select({ n: count() }).from(schema.talentPoolCandidates).where(eq(schema.talentPoolCandidates.recruiterId, userId)),
    db
      .select({ status: schema.candidateSubmissions.status })
      .from(schema.candidateSubmissions)
      .where(eq(schema.candidateSubmissions.recruiterId, userId)),
  ]);

  const poolCount = poolRows[0]?.n ?? 0;
  const submittedCount = submissions.filter((s) => (s.status ?? "").toLowerCase() === "submitted").length;

  const actions: RecommendationDto[] = [];

  if (poolCount === 0) {
    actions.push({
      id: "find-candidate",
      title: "Find your first candidate",
      description: "Browse profiles and start building your talent pipeline.",
      actionLabel: "Search people",
      url: "/people",
      icon: "candidate",
      priority: 0,
    });
  }

  if (submittedCount > 0) {
    actions.push({
      id: "follow-up-submissions",
      title: `Chase ${submittedCount} open submission${submittedCount === 1 ? "" : "s"}`,
      description: "Candidates you've submitted are awaiting an employer decision.",
      actionLabel: "View pipeline",
      url: "/recruiter/pipeline",
      icon: "followup",
      priority: 1,
    });
  }

  actions.push({
    id: "source-candidates",
    title: "Source new candidates",
    description: "Grow your pipeline with fresh profiles that match your roles.",
    actionLabel: "Search people",
    url: "/people",
    icon: "candidate",
    priority: 5,
  });

  return actions;
}

async function employerActions(userId: string, db: ReturnType<typeof getDb>): Promise<RecommendationDto[]> {
  const jobRows = await db
    .select({ isActive: schema.jobItems.isActive })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.postedByUserId, userId));

  const activeJobs = jobRows.filter((j) => j.isActive).length;
  const actions: RecommendationDto[] = [];

  if (activeJobs === 0) {
    actions.push({
      id: "post-job",
      title: "Post your first job",
      description: "Create a posting to start attracting candidates.",
      actionLabel: "Post a job",
      url: "/jobs",
      icon: "job",
      priority: 0,
    });
  } else {
    actions.push({
      id: "review-applicants",
      title: "Review your applicants",
      description: "Check new applicants across your open positions.",
      actionLabel: "View applicants",
      url: "/jobs",
      icon: "followup",
      priority: 1,
    });
  }

  actions.push({
    id: "complete-company",
    title: "Polish your company page",
    description: "A strong company page helps candidates choose you.",
    actionLabel: "Edit company",
    url: "/companies",
    icon: "job",
    priority: 5,
  });

  return actions;
}

export async function getNextBestActions(
  userId: string,
  role: string,
  db: ReturnType<typeof getDb> = getDb(),
  limit = 4,
): Promise<RecommendationDto[]> {
  let actions: RecommendationDto[];
  switch (role) {
    case "recruiter":
      actions = await recruiterActions(userId, db);
      break;
    case "employer":
      actions = await employerActions(userId, db);
      break;
    case "job_seeker":
    case "employee":
      actions = await jobSeekerActions(userId, db);
      break;
    default:
      actions = [];
  }
  return actions.sort((a, b) => a.priority - b.priority).slice(0, limit);
}
