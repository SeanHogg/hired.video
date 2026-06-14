// SuperAdmin — "who is active now" presence + engagement (#2045). Lists
// sessions seen in the last few minutes (visitors + identified users), fed by
// the usage tracker. Identified users link to their profile (where the message
// affordance lives) so staff can engage while intent is hot; anonymous
// visitors can be erased (DSR).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Loader2, MessageSquare, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { usageService } from "@/lib/services/usage-service";
import { ACTIVE_WINDOW_MINUTES, type ActiveSessionDto } from "@shared/usage";

export default function ActiveUsers() {
  const [sessions, setSessions] = useState<ActiveSessionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setSessions(await usageService.adminActive());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // Presence is short-lived; poll while the page is open (cheap, cached read).
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, []);

  const erase = async (s: ActiveSessionDto) => {
    setBusyId(s.sessionId);
    try {
      await usageService.adminEraseVisitor(s.visitorId);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const identified = sessions.filter((s) => s.isAuthenticated && s.userId);
  const anon = sessions.filter((s) => !s.isAuthenticated || !s.userId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Active Now
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Sessions seen in the last {ACTIVE_WINDOW_MINUTES} minutes —
            identified users and anonymous visitors. Engage identified users
            while their intent is hot; anonymous visitors can be erased (DSR).
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No active sessions in the last {ACTIVE_WINDOW_MINUTES} minutes.
          </CardContent>
        </Card>
      ) : (
        <>
          <Section title={`Identified (${identified.length})`}>
            {identified.map((s) => (
              <SessionRow key={s.sessionId} s={s} busy={busyId === s.sessionId} onErase={() => erase(s)} />
            ))}
            {identified.length === 0 && <Empty>No identified users active.</Empty>}
          </Section>
          <Section title={`Anonymous visitors (${anon.length})`}>
            {anon.map((s) => (
              <SessionRow key={s.sessionId} s={s} busy={busyId === s.sessionId} onErase={() => erase(s)} />
            ))}
            {anon.length === 0 && <Empty>No anonymous visitors active.</Empty>}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground px-1">{children}</p>;
}

function SessionRow({
  s,
  busy,
  onErase,
}: {
  s: ActiveSessionDto;
  busy: boolean;
  onErase: () => void;
}) {
  const when = new Date(s.lastSeen);
  const ago = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {s.isAuthenticated && s.userId ? `User ${s.userId.slice(0, 8)}` : "Visitor"}
          </span>
          {s.role && <Badge variant="outline" className="capitalize">{s.role.replace("_", " ")}</Badge>}
          {s.country && <Badge variant="secondary">{s.country}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {s.lastEventType ?? "page"} · {s.lastPath ?? s.entryPath ?? "—"} · {ago}s ago
        </p>
      </div>
      <div className="flex items-center gap-2">
        {s.isAuthenticated && s.userId ? (
          <Button size="sm" variant="default" asChild>
            <Link to={`/people/${s.userId}`}>
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Engage
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={onErase}
            aria-label="Erase visitor (DSR)"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
