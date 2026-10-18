/**
 * React Query key SSoT. Every user-scoped key carries the viewer's user id so
 * a SuperAdmin impersonation (or an account switch) can never be served the
 * previous identity's cached rows. Invalidate by the bare prefix
 * (`{ queryKey: queryKeys.resumes.all }`) to hit every user's entry.
 */

type Id = string | null | undefined;

export const queryKeys = {
  resumes: {
    all: ["resumes"] as const,
    byUser: (userId: Id) => ["resumes", userId ?? null] as const,
  },
  resume: {
    all: ["resume"] as const,
    byId: (id: Id) => ["resume", id ?? null] as const,
  },
  job: {
    all: ["job"] as const,
    byId: (id: Id) => ["job", id ?? null] as const,
  },
  user: {
    all: ["user"] as const,
    byId: (id: Id) => ["user", id ?? null] as const,
  },
  studioProjects: {
    all: ["studio-projects"] as const,
    byUser: (userId: Id) => ["studio-projects", userId ?? null] as const,
  },
  studioProject: {
    all: ["studio-project"] as const,
    byId: (id: Id) => ["studio-project", id ?? null] as const,
  },
  creatorMine: {
    all: ["creator-mine"] as const,
    byUser: (userId: Id) => ["creator-mine", userId ?? null] as const,
  },
  savedJobs: {
    all: ["saved-jobs"] as const,
    byUser: (userId: Id) => ["saved-jobs", userId ?? null] as const,
  },
  myCompanies: {
    all: ["my-companies"] as const,
    byUser: (userId: Id) => ["my-companies", userId ?? null] as const,
  },
  points: {
    all: ["points"] as const,
    me: (userId: Id) => ["points", "me", userId ?? null] as const,
  },
  accountsAvailable: {
    all: ["accounts-available"] as const,
    byUser: (userId: Id) => ["accounts-available", userId ?? null] as const,
  },
  roleAccess: {
    all: ["role-access"] as const,
    byRole: (userId: Id, role: string) => ["role-access", userId ?? null, role] as const,
  },
  graphMutuals: {
    all: ["graph-mutuals"] as const,
    byTarget: (userId: Id, targetUserId: Id) =>
      ["graph-mutuals", userId ?? null, targetUserId ?? null] as const,
  },
  cookiePreferences: {
    all: ["cookie-preferences"] as const,
    byUser: (userId: Id) => ["cookie-preferences", userId ?? null] as const,
  },
  activeUsers: {
    all: ["active-users"] as const,
    byUser: (userId: Id) => ["active-users", userId ?? null] as const,
  },
} as const;
