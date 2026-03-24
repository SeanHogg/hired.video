// Shared pricing/constants to keep UI in sync across pages
export const PREMIUM_MONTHLY_PRICE = 9.95;
export const PREMIUM_YEARLY_PRICE = 95.40; // ~$7.95/mo, 20% saving

// Free-tier hard limits — enforced at API level
export const FREE_AI_MONTHLY_LIMIT = 10;        // AI token requests per month
export const FREE_AI_MONTHLY_TOKENS = 50_000;   // token ceiling per month
export const FREE_TEAM_MEMBER_LIMIT = 2;        // max team members (inviter + 1)
export const FREE_MONTHLY_MATCHES = 5;          // resume-to-job matches per month
export const FREE_MONTHLY_APPLICATIONS = 10;   // job applications per month

