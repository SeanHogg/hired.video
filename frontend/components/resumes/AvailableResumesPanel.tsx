// AvailableResumesPanel — public-resume browse surface for hiring-side
// viewers on `/resumes?tab=available`. Reads the existing
// `/api/resumes/public` discovery feed via `resumeService.getPublicResumes`.
// Self-gating: render is opt-in by the EntityHubShell descriptor
// (recruiter / employer / admin / SA). The component itself doesn't role-check.
//
// Cards link to the canonical resume viewer at `/resumes/:id`. No
// owner-only affordances (no rename / delete / privacy toggle); read-only
// grid for sourcing browsing.

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { resumeService } from "@/lib/services/resume-service";
import ResumeCard from "@/components/ResumeCard";

// Loose shape — `getPublicResumes` normalises the wire payload into a
// hybrid (some `description` + `summary`, some new field names) so we
// keep the type wide and pull just the fields the card needs.
interface PublicResumeItem {
  id: string;
  userId: string;
  title: string;
  slug?: string | null;
  summary?: string;
  description?: string;
  privacy?: "public" | "recruiter_only" | "connections" | "private" | "draft";
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 24;

export default function AvailableResumesPanel(): JSX.Element {
  const navigate = useNavigate();
  const [items, setItems] = useState<PublicResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resumeService
      .getPublicResumes(1, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setItems((res.items ?? []) as unknown as PublicResumeItem[]);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const title = (r.title ?? "").toLowerCase();
      const summary = (r.summary ?? r.description ?? "").toLowerCase();
      return title.includes(q) || summary.includes(q);
    });
  }, [items, search]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search public resumes by title or summary"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-44 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-10 text-center">
          <h3 className="font-semibold">
            {items.length === 0 ? "No public resumes yet" : "No resumes match your search"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {items.length === 0
              ? "Public resumes will appear here as candidates publish them."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filtered.map((r) => (
            <ResumeCard
              key={r.id}
              id={r.id}
              slug={r.slug ?? undefined}
              userId={r.userId}
              name={r.title}
              title={r.title}
              summary={r.summary ?? r.description ?? ""}
              createdAt={r.createdAt}
              privacy={r.privacy}
              isMaster={r.isMaster}
              isActive={r.isActive}
              parentId={r.parentId ?? undefined}
              ownership="tracked"
              onView={() => navigate(`/resumes/${r.id}`)}
              onShare={() => navigator.clipboard.writeText(`${window.location.origin}/resumes/${r.id}`)}
              onCopyLink={() => navigator.clipboard.writeText(`${window.location.origin}/resumes/${r.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
