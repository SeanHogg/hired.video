/**
 * WarmIntrosTab — incoming + outgoing warm-intro requests, the
 * LinkedIn-"Get introduced" loop.
 *
 *   - Incoming (viewer is the mutual being asked) shows the requester +
 *     who they want to meet, with a one-click "Forward intro" CTA that
 *     spins up a 3-party conversation seeded with the original ask.
 *   - Outgoing (viewer is the requester) shows who they asked + the
 *     forwarded-to conversation once the mutual has acted.
 *
 * Mirrors CoffeeTab — same shape, same loading/empty/busy states —
 * because the two surfaces share a single home in MyEventsAndCoffee.
 *
 * Self-gates by going empty when there are zero intros on either side.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chatBus } from "@/lib/chat-bus";
import {
  graphService,
  type WarmIntroSummary,
} from "@/lib/services/graph-service";
import { initials } from "@/lib/utils/initials";

export function WarmIntrosTab() {
  const [incoming, setIncoming] = useState<WarmIntroSummary[]>([]);
  const [outgoing, setOutgoing] = useState<WarmIntroSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        graphService.incomingIntros(),
        graphService.outgoingIntros(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function forward(conversationId: string) {
    setBusyId(conversationId);
    setError(null);
    try {
      await graphService.forwardIntro(conversationId);
      await reload();
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");
      if (msg.includes("403")) {
        setError("Only the asked mutual can forward this intro.");
      } else {
        setError("Couldn't forward the intro. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function decline(conversationId: string) {
    setBusyId(conversationId);
    setError(null);
    try {
      await graphService.declineIntro(conversationId);
      await reload();
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");
      if (msg.includes("403")) {
        setError("Only the asked mutual can decline this intro.");
      } else {
        setError("Couldn't decline the intro. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground mb-4">
          No warm-intro requests yet — open someone's profile and click "Ask for
          an intro" to ask a mutual.
        </p>
        <Button asChild>
          <Link to="/people">Find people</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm p-2 rounded border border-red-200 bg-red-50 text-red-800">
          {error}
        </div>
      )}

      {incoming.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            People asking you for an intro
          </h3>
          <div className="space-y-2">
            {incoming.map((r) => (
              <div
                key={r.conversationId}
                className="flex items-start gap-3 p-3 border rounded-lg bg-card"
              >
                <Avatar>
                  {r.requester.avatarUrl ? (
                    <AvatarImage src={r.requester.avatarUrl} alt={r.requester.name ?? ""} />
                  ) : null}
                  <AvatarFallback>{initials(r.requester.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    <Link to={`/people/${r.requester.userId}`} className="hover:underline">
                      {r.requester.name ?? "Someone"}
                    </Link>{" "}
                    wants an intro to{" "}
                    <Link to={`/people/${r.target.userId}`} className="hover:underline">
                      {r.target.name ?? "your connection"}
                    </Link>
                  </div>
                  {r.message && (
                    <p className="text-sm text-muted-foreground line-clamp-3 mt-0.5">
                      "{r.message}"
                    </p>
                  )}
                  {r.status === "forwarded" && r.forwardedConversationId && (
                    <p className="text-xs text-green-700 mt-1">
                      You forwarded this intro.
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {r.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => forward(r.conversationId)}
                        disabled={busyId === r.conversationId}
                      >
                        {busyId === r.conversationId && (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        )}
                        Forward intro
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decline(r.conversationId)}
                        disabled={busyId === r.conversationId}
                      >
                        Decline
                      </Button>
                    </>
                  ) : (
                    <WarmIntroStatusBadge status={r.status} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            Intros you've asked for
          </h3>
          <div className="space-y-2">
            {outgoing.map((r) => (
              <div
                key={r.conversationId}
                className="flex items-start gap-3 p-3 border rounded-lg bg-card"
              >
                <Avatar>
                  {r.target.avatarUrl ? (
                    <AvatarImage src={r.target.avatarUrl} alt={r.target.name ?? ""} />
                  ) : null}
                  <AvatarFallback>{initials(r.target.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    Asked{" "}
                    <Link to={`/people/${r.via.userId}`} className="hover:underline">
                      {r.via.name ?? "a mutual"}
                    </Link>{" "}
                    to introduce you to{" "}
                    <Link to={`/people/${r.target.userId}`} className="hover:underline">
                      {r.target.name ?? "this person"}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    <WarmIntroStatusBadge status={r.status} />
                    {r.status === "forwarded" && r.forwardedConversationId && (
                      <button
                        type="button"
                        onClick={() => chatBus.open(r.forwardedConversationId!)}
                        className="text-blue-600 hover:underline flex items-center"
                      >
                        Open thread
                        <ArrowRight className="w-3 h-3 ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function WarmIntroStatusBadge({ status }: { status: WarmIntroSummary["status"] }) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "forwarded":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Forwarded
        </Badge>
      );
    case "declined":
      return <Badge variant="destructive">Declined</Badge>;
    case "expired":
      return <Badge variant="outline">Expired</Badge>;
  }
}
