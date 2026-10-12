/**
 * The viewer's master résumés — what a variant can branch from in the create
 * step (#2221). Loads only while `enabled` (the dialog is open on résumé) and
 * the viewer is signed in; a signed-out visitor or a failed read has none, so
 * the step offers "new master" only.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";

export interface MasterResume {
  id: string;
  title: string;
}

export function useMasterResumes(enabled: boolean): { masters: MasterResume[]; loading: boolean } {
  const { user } = useAuth();
  const signedIn = !!user;
  const [masters, setMasters] = useState<MasterResume[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !signedIn) {
      setMasters([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    resumeService
      .getUserResumes()
      .then((list) => {
        if (cancelled) return;
        setMasters(
          list
            .filter((r) => r.isMaster === true && typeof r.id === "string" && r.id !== "")
            .map((r) => ({ id: r.id as string, title: r.title?.trim() || "" })),
        );
      })
      .catch(() => {
        if (!cancelled) setMasters([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, signedIn]);

  return { masters, loading };
}
