import { publicResumePath } from "@shared/public-paths";
import type { SearchFilters } from "@/components/SearchBar";
import type { MasterResumeGroup } from "@/lib/services/resume-service";
import type { ResumePrivacy, ResumeWithOwnership } from "@/types/resume";

/** Applies the header search/privacy/type filters plus the optional Lists
 *  membership filter (?list_id=…). Counts, sections and pagination all see
 *  the filtered set. */
export function filterResumes(
  resumes: ResumeWithOwnership[],
  filters: SearchFilters,
  listMembership: Set<string> | null,
): ResumeWithOwnership[] {
  return resumes.filter((resume) => {
    const searchTerm = filters.search || "";
    if (
      searchTerm &&
      !resume.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !resume.summary.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    if (filters.privacy && resume.privacy !== filters.privacy) {
      return false;
    }
    if (filters.isMaster !== undefined && resume.isMaster !== filters.isMaster) {
      return false;
    }
    if (listMembership && !listMembership.has(resume.id)) return false;
    return true;
  });
}

/** Parent → children map used by each ResumeCard to render its variant
 *  slider. Built from the unfiltered list so a search filter on the parent
 *  doesn't hide its variants inside the card. */
export function buildChildrenByParentId(
  resumes: ResumeWithOwnership[],
): Map<string, ResumeWithOwnership[]> {
  const map = new Map<string, ResumeWithOwnership[]>();
  for (const r of resumes) {
    if (!r.parentId) continue;
    const list = map.get(r.parentId);
    if (list) list.push(r);
    else map.set(r.parentId, [r]);
  }
  return map;
}

/** Owned resumes that lose their exclusive visibility (Public, Recruiter
 *  Only, Connections) when `resumeId` is switched to `privacy`. */
export function findDemotedByPrivacy(
  resumes: ResumeWithOwnership[],
  resumeId: string,
  privacy: ResumePrivacy,
): ResumeWithOwnership[] {
  return resumes.filter((r) => r.ownership === "owned" && r.id !== resumeId && (
    (privacy === "public" && r.privacy === "public") ||
    (privacy === "recruiter_only" && r.privacy === "recruiter_only") ||
    (privacy === "connections" && r.privacy === "connections")
  ));
}

/** Removes a resume from the master groups. If a master was deleted its
 *  variations are promoted to standalone groups instead of being dropped. */
export function removeFromMasterGroups(
  groups: MasterResumeGroup[],
  deletedId: string,
): MasterResumeGroup[] {
  const nextGroups: MasterResumeGroup[] = [];
  for (const g of groups) {
    if (g.masterResume.id === deletedId) {
      for (const v of g.variations) {
        nextGroups.push({ masterResume: { ...v, isMaster: false, parentId: null }, variations: [] });
      }
    } else {
      nextGroups.push({
        ...g,
        variations: g.variations.filter((v) => v.id !== deletedId),
      });
    }
  }
  return nextGroups;
}

/** Applies a rename to both the flat list and the master groups. */
export function renameInState(
  resumes: ResumeWithOwnership[],
  groups: MasterResumeGroup[],
  targetId: string,
  newName: string,
): { resumes: ResumeWithOwnership[]; groups: MasterResumeGroup[] } {
  return {
    resumes: resumes.map((r) => (r.id === targetId ? { ...r, title: newName } : r)),
    groups: groups.map((g) => ({
      ...g,
      masterResume: g.masterResume?.id === targetId ? { ...g.masterResume, title: newName } : g.masterResume,
      variations: g.variations.map((v) => (v.id === targetId ? { ...v, title: newName } : v)),
    })),
  };
}

/** Absolute public share URL for a resume. */
export function resumeShareUrl(resumeId: string): string {
  return `${window.location.origin}${publicResumePath(resumeId)}`;
}
