// Canonical showcase job — used by JobTemplateGallery cards, /jobs/sample,
// and any future preview surface. Every section has realistic content so
// whichever template picks it up, every block renders meaningfully.
//
// Positioned as a hired.video-internal role ("Senior Full-Stack Engineer")
// so the sample doubles as a recruiting billboard for the platform.

export interface SampleJobCompany {
  name: string;
  logo?: string;
  description?: string;
  industry?: string;
  size?: string;
  website?: string;
}

export interface SampleJobLocation {
  city?: string;
  state?: string;
  remote: boolean;
}

export interface SampleJobRequirement {
  skill: string;
  level: string;
  required: boolean;
}

export interface SampleJobBenefit {
  type: string;
  description: string;
}

export interface SampleJobData {
  title: string;
  description: string;
  company: SampleJobCompany;
  location: SampleJobLocation;
  contactEmail?: string;
  applicationDeadline?: string;
  applyUrl?: string;
  responsibilities: string[];
  requirements: SampleJobRequirement[];
  qualifications: string[];
  skills: string[];
  benefits: SampleJobBenefit[];
  employmentType: string;
  experienceLevel: string;
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
}

export interface SampleJob {
  id: string;
  status: "active" | "paused" | "closed" | "draft";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  views: number;
  applications: number;
  userId: string;
  data: SampleJobData;
}

export const SAMPLE_JOB: SampleJob = {
  id: "sample",
  status: "active",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
  expiresAt: "2026-06-01T00:00:00Z",
  views: 0,
  applications: 0,
  userId: "sample",
  data: {
    title: "Senior Full-Stack Engineer",
    description: `
## About the role

Hired.video is building the AI-native platform that replaces LinkedIn + Loom + ATS + career copilot — one product where job seekers record video resumes, recruiters source and pitch candidates, and companies hire with AI as a first-class collaborator.

We're looking for a **Senior Full-Stack Engineer** to own end-to-end features across our React + Cloudflare Workers + Drizzle/Postgres stack. You'll ship directly to users every week, work closely with the CTO on architecture, and help shape the AI tooling roadmap that's powering our 10× trajectory in 2026.

This role is for someone who enjoys owning things end-to-end — schema to migration to API to UI — and who writes clean, shippable code without being told to.
`.trim(),
    company: {
      name: "Hired.video",
      logo: "https://hired.video/og.png",
      description:
        "AI-native hiring platform — LinkedIn + Loom + ATS + career copilot in one. Used by job seekers, recruiters, and hiring teams across 40+ countries.",
      industry: "HR Tech / AI",
      size: "11-50",
      website: "https://hired.video",
    },
    location: {
      city: "Detroit Metro",
      state: "MI",
      remote: true,
    },
    contactEmail: "careers@hired.video",
    applicationDeadline: "2026-06-01",
    applyUrl: "https://hired.video/jobs/sample/apply",
    employmentType: "Full-time",
    experienceLevel: "Senior",
    salaryMin: 150000,
    salaryMax: 220000,
    salaryCurrency: "USD",
    responsibilities: [
      "Own features end-to-end: Drizzle schema, SQL migration, Hono API routes, React UI, tests.",
      "Ship to production every week behind feature flags — small PRs, fast reviews, tight feedback loops.",
      "Design and build AI-assisted tools (resume scoring, job matching, candidate sourcing agents) using the Anthropic SDK with prompt caching.",
      "Collaborate on architecture decisions for multi-tenant row-level security, brand-kit rendering, and tokenized public share links.",
      "Mentor junior engineers on TypeScript, Drizzle, and our testing conventions.",
      "Review PRs with constructive, specific feedback — help the team level up together.",
    ],
    requirements: [
      { skill: "TypeScript", level: "Expert", required: true },
      { skill: "React + Vite", level: "Expert", required: true },
      { skill: "Postgres + SQL", level: "Advanced", required: true },
      { skill: "Cloudflare Workers (Hono)", level: "Intermediate", required: false },
      { skill: "Drizzle ORM", level: "Intermediate", required: false },
      { skill: "Anthropic / Claude API", level: "Intermediate", required: false },
      { skill: "Tailwind CSS", level: "Advanced", required: true },
      { skill: "Test-Driven Development", level: "Advanced", required: true },
    ],
    qualifications: [
      "5+ years shipping production web applications end-to-end.",
      "Strong opinions on schema design, transactional correctness, and failure modes — and the humility to change them with evidence.",
      "Comfortable reading an open-source codebase to unblock yourself rather than waiting on docs.",
      "Experience with multi-tenant data isolation, row-level security, or similar scoped-access patterns.",
      "Track record of pairing with non-technical founders/PMs to turn vague business goals into shippable features.",
      "Bonus: you've shipped AI-assisted features using an LLM in a production hot path.",
    ],
    skills: [
      "TypeScript",
      "React",
      "Vite",
      "Tailwind CSS",
      "Postgres",
      "Drizzle",
      "Hono",
      "Cloudflare Workers",
      "Zod",
      "Anthropic SDK",
      "Stripe",
      "Git",
      "Unit Testing (Vitest)",
    ],
    benefits: [
      {
        type: "Remote-first",
        description: "Work from anywhere in US/EU/UK time zones. Quarterly in-person off-sites in Detroit or Austin.",
      },
      {
        type: "Meaningful equity",
        description: "Early-stage equity with 4-year vesting + 1-year cliff. Top decile of market for senior hires.",
      },
      {
        type: "Learning budget",
        description: "$3,000/year for courses, conferences, books, and tools. Used however you want — no approval loops.",
      },
      {
        type: "Top-tier health benefits",
        description: "100% employer-covered medical, dental, and vision for you and your dependents (US employees).",
      },
      {
        type: "Hardware of choice",
        description: "MacBook Pro M-series, Studio Display or equivalent, and any peripherals you need. Refreshed every 3 years.",
      },
      {
        type: "Unlimited PTO (enforced)",
        description: "Take what you need, with a 15-day minimum per year so it's not lip service.",
      },
    ],
  },
};
