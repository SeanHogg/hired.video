// useWorkspace — single source of truth for "the workspace I'm acting as"
// across Studio. Sidebar, wizard, save-draft, publish all read from here.
//
// Workspaces come from /api/workspaces and fall into three kinds:
//   personal   - the user's own personal workspace
//   company    - a company they own or are an active member of
//   delegated  - a job seeker who has granted them edit rights via
//                workspace_grants (video editor / coach for hire)
//
// The current selection persists to localStorage so reloading Studio
// keeps the user in the same workspace they were just acting through.

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export type WorkspaceSelection =
  | { kind: "personal" }
  | { kind: "company"; companyId: string }
  | { kind: "delegated"; subjectUserId: string };

export interface PersonalWorkspace { kind: "personal"; label: string }
export interface CompanyWorkspace {
  kind: "company";
  companyId: string;
  label: string;
  slug: string | null;
  logoUrl: string | null;
}
export interface DelegatedWorkspace {
  kind: "delegated";
  subjectUserId: string;
  label: string;
}

export interface WorkspacesPayload {
  personal: PersonalWorkspace;
  companies: CompanyWorkspace[];
  delegated: DelegatedWorkspace[];
}

const STORAGE_KEY = "studio_workspace_selection";
const PERSONAL: WorkspaceSelection = { kind: "personal" };

function readPersistedSelection(): WorkspaceSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PERSONAL;
    const parsed = JSON.parse(raw) as WorkspaceSelection;
    if (
      parsed?.kind === "personal" ||
      (parsed?.kind === "company" && typeof parsed.companyId === "string") ||
      (parsed?.kind === "delegated" && typeof parsed.subjectUserId === "string")
    ) {
      return parsed;
    }
  } catch {
    // ignore corrupted persistence
  }
  return PERSONAL;
}

function writePersistedSelection(s: WorkspaceSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors (quota / private mode)
  }
}

/** Fetches /api/workspaces. Cached for the session via react-query. */
export function useWorkspacesData() {
  return useQuery<WorkspacesPayload>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await apiClient.get<WorkspacesPayload>("/api/workspaces");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The current selection + helpers. Single source of truth — every Studio
 *  surface that needs to know "who am I acting as right now" reads here.
 *  The selection persists across reloads via localStorage. */
export function useWorkspace() {
  const [selection, setSelectionState] = useState<WorkspaceSelection>(readPersistedSelection);
  const data = useWorkspacesData();

  // If the persisted selection points at a workspace the user no longer
  // has access to (membership revoked, grant expired), fall back to
  // personal silently. Runs once data is loaded.
  useEffect(() => {
    if (!data.data) return;
    if (selection.kind === "company") {
      const ok = data.data.companies.some((c) => c.companyId === selection.companyId);
      if (!ok) setSelection(PERSONAL);
    } else if (selection.kind === "delegated") {
      const ok = data.data.delegated.some((d) => d.subjectUserId === selection.subjectUserId);
      if (!ok) setSelection(PERSONAL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data]);

  const setSelection = useCallback((s: WorkspaceSelection) => {
    setSelectionState(s);
    writePersistedSelection(s);
  }, []);

  /** True iff the user has at least one workspace beyond personal. The
   *  WorkspaceSwitcher component uses this to self-gate (hide entirely
   *  for users who have nothing to switch between). */
  const hasMultipleWorkspaces =
    (data.data?.companies.length ?? 0) + (data.data?.delegated.length ?? 0) > 0;

  return {
    selection,
    setSelection,
    workspaces: data.data,
    isLoading: data.isLoading,
    hasMultipleWorkspaces,
  };
}

/** Serialise a selection into the body shape every Studio mutation
 *  accepts. Returns undefined for personal so existing personal-only
 *  flows that don't include the field continue to work unchanged. */
export function selectionToRequestBody(s: WorkspaceSelection): {
  workspace?: { kind: "company"; companyId: string } | { kind: "delegated"; subjectUserId: string };
} {
  if (s.kind === "personal") return {};
  return { workspace: s };
}

/** Serialise a selection into the `?workspace=` query param value the
 *  Studio read endpoints accept. Mirrors `parseWorkspaceQueryParam` on
 *  the server: "personal" | "company:<id>" | "delegated:<id>". */
export function selectionToQuery(s: WorkspaceSelection): string {
  if (s.kind === "personal") return "personal";
  if (s.kind === "company") return `company:${s.companyId}`;
  return `delegated:${s.subjectUserId}`;
}
