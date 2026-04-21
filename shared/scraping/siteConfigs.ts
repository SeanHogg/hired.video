/**
 * Per-host site configs used by the Chrome extension's DOM-based job
 * detection. Lives in shared/ so (a) the API knows which hosts we have
 * first-class support for, and (b) both extension flavors (jobseeker +
 * recruiter) pull from one place.
 */

/**
 * Content selectors that identify "the job content has loaded" on major
 * job sites. Used by the extension's MutationObserver before it captures
 * the page HTML for upload.
 */
export const JOB_CONTENT_READY_SELECTORS = [
  ".jobs-description__container", // LinkedIn
  "#jobDescriptionText", // Indeed
  ".jobDescriptionContent", // Glassdoor
  ".job_description", // ZipRecruiter
  '[class*="job-description"]', // Generic
  '[class*="jobDescription"]', // Generic
  '[data-testid*="description"]', // Various
  'script[type="application/ld+json"]', // Structured data
];

/**
 * Per-host title-element selectors to query INSIDE a focused job pane.
 * ORDER MATTERS — most specific first. `h1` is intentionally omitted
 * from LinkedIn because on collection pages the page-level h1 is the
 * list title ("Jobs where you'd be a top applicant"), not the job.
 */
export const FOCUSED_TITLE_SELECTORS: Record<string, string[]> = {
  "linkedin.com": [
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    ".top-card-layout__title",
  ],
  "indeed.com": [
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    ".jobsearch-JobInfoHeader-title",
    "h1",
  ],
  "glassdoor.com": [
    '[data-test="job-title"]',
    ".JobDetails_jobTitle__",
    "h1",
  ],
  "ziprecruiter.com": [".job_title", ".t_job_title", "h1"],
};

export const FOCUSED_COMPANY_SELECTORS: Record<string, string[]> = {
  "linkedin.com": [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".topcard__org-name-link",
  ],
  "indeed.com": [
    '[data-testid="inlineHeader-companyName"]',
    '[data-testid="jobsearch-JobInfoHeader-companyName"]',
    ".jobsearch-CompanyInfoContainer a",
  ],
  "glassdoor.com": [
    '[data-test="employer-name"]',
    ".EmployerProfile_employerName__",
  ],
  "ziprecruiter.com": [".hiring_company_text", ".t_org_link"],
};

export const FOCUSED_LOCATION_SELECTORS: Record<string, string[]> = {
  "linkedin.com": [
    ".job-details-jobs-unified-top-card__bullet",
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".jobs-unified-top-card__bullet",
    ".topcard__flavor--bullet",
  ],
  "indeed.com": [
    '[data-testid="job-location"]',
    '[data-testid="inlineHeader-companyLocation"]',
  ],
  "glassdoor.com": ['[data-test="location"]'],
  "ziprecruiter.com": [".hiring_location"],
};

/**
 * Section headings that are NOT job titles — used to filter noise when
 * fall-back extractors walk `<h1>/<h2>` under the focused pane.
 */
export const LINKEDIN_NOISE_HEADINGS = new Set([
  "about the job",
  "about this role",
  "how your profile and resume fit this job",
  "people also viewed",
  "people you can reach out to",
  "similar jobs",
  "benefits found in job post",
  "skills",
  "responsibilities",
  "qualifications",
  "job description",
  "about the company",
]);

export const GOOGLE_JOBS_NOISE_HEADINGS = new Set([
  "job highlights",
  "qualifications",
  "responsibilities",
  "benefits",
  "full job description",
  "job description",
  "about the company",
  "related searches",
  "jobs",
  "job postings",
  "saved jobs",
  "following",
  "more job highlights",
  "how you match",
  "reviews",
  "description",
]);

export const GENERIC_TITLE_NOISE = new Set([
  "home",
  "careers",
  "jobs",
  "job openings",
  "open positions",
  "search results",
  "apply now",
  "sign in",
  "log in",
  "menu",
]);
