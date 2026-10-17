/**
 * The viewer's master résumés — what a variant can branch from in the create
 * step (#2221). Loads only while `enabled` (the dialog is open on résumé) and
 * the viewer is signed in; a signed-out visitor or a failed read has none, so
 * the step offers "new master" only.
 */
import { useMemo } from "react";
import { useUserResumes } from "@/hooks/queries/use-resumes";

export interface MasterResume {
  id: string;
  title: string;
}

export function useMasterResumes(enabled: boolean): { masters: MasterResume[]; loading: boolean } {
  const query = useUserResumes({ enabled });
  const list = enabled ? query.data : undefined;
  const masters = useMemo<MasterResume[]>(
    () =>
      (list ?? [])
        .filter((r) => r.isMaster === true && typeof r.id === "string" && r.id !== "")
        .map((r) => ({ id: r.id as string, title: r.title?.trim() || "" })),
    [list],
  );

  return { masters, loading: enabled && query.isLoading };
}
