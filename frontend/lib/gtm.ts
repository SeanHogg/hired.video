/**
 * GTM dataLayer helper — push events from anywhere in the app.
 *
 * Usage:
 *   gtmEvent("sign_up", { method: "email" });
 *   gtmEvent("purchase", { value: 49, currency: "USD", plan: "recruiter_monthly" });
 *   gtmEvent("job_application", { job_id: "abc", job_title: "Senior Engineer" });
 */
export function gtmEvent(eventName: string, params?: Record<string, unknown>) {
  try {
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: eventName, ...params });
  } catch {
    // no-op — never break the app for analytics
  }
}

// Pre-typed helpers for key conversion events

export function trackSignUp(method: "email" | "google" | "passkey" | "magic_link") {
  gtmEvent("sign_up", { method });
}

export function trackLogin(method: "email" | "google" | "passkey" | "magic_link") {
  gtmEvent("login", { method });
}

export function trackSubscription(plan: string, interval: "monthly" | "yearly", valueUsd: number) {
  gtmEvent("purchase", {
    currency: "USD",
    value: valueUsd,
    items: [{ item_id: plan, item_name: plan }],
    plan,
    interval,
  });
}

export function trackJobApplication(jobId: string, jobTitle: string, companyName?: string) {
  gtmEvent("job_application", { job_id: jobId, job_title: jobTitle, company_name: companyName });
}

export function trackResumeCreated(resumeType: "standard" | "video" | "upload") {
  gtmEvent("resume_created", { resume_type: resumeType });
}

export function trackCHROQuery(queryLength: number) {
  gtmEvent("chro_query", { query_length: queryLength });
}
