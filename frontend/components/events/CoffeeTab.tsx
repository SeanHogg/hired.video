/**
 * CoffeeTab — incoming + outgoing "Grab a coffee" requests.
 *
 * - Incoming pending requests show Accept / Decline inline.
 * - Accepted requests link to the resulting event detail page.
 * - Outgoing pending requests can be cancelled.
 *
 * Per the DRY rule, this is the single surface for coffee state — the
 * dashboard widget + Tasks tab both render through this component.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coffee, ArrowRight, Loader2 } from "lucide-react";
import { coffeeService, type CoffeeRequest } from "@/lib/services/coffee-service";
import { userService } from "@/lib/services/user-service";

interface CoffeeRequestWithPeople extends CoffeeRequest {
  requesterName?: string | null;
  recipientName?: string | null;
  requesterAvatarUrl?: string | null;
  recipientAvatarUrl?: string | null;
}

export function CoffeeTab({ viewerUserId: _viewerUserId }: { viewerUserId: string }) {
  const [incoming, setIncoming] = useState<CoffeeRequestWithPeople[]>([]);
  const [outgoing, setOutgoing] = useState<CoffeeRequestWithPeople[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        coffeeService.incoming("pending"),
        coffeeService.outgoing(),
      ]);
      const userIds = Array.from(
        new Set([
          ...inc.map((r) => r.requesterUserId),
          ...out.map((r) => r.recipientUserId),
        ]),
      );
      const users = await Promise.all(
        userIds.map((id) => userService.getUserById(id).catch(() => null)),
      );
      const byId = new Map(userIds.map((id, i) => [id, users[i]]));
      const hydrate = (r: CoffeeRequest, role: "incoming" | "outgoing"): CoffeeRequestWithPeople => {
        const other = byId.get(role === "incoming" ? r.requesterUserId : r.recipientUserId) as any;
        return {
          ...r,
          requesterName:
            role === "incoming"
              ? (other?.profile?.displayName ?? [other?.firstName, other?.lastName].filter(Boolean).join(" ") ?? null)
              : null,
          requesterAvatarUrl: role === "incoming" ? other?.avatarUrl ?? null : null,
          recipientName:
            role === "outgoing"
              ? (other?.profile?.displayName ?? [other?.firstName, other?.lastName].filter(Boolean).join(" ") ?? null)
              : null,
          recipientAvatarUrl: role === "outgoing" ? other?.avatarUrl ?? null : null,
        };
      };
      setIncoming(inc.map((r) => hydrate(r, "incoming")));
      setOutgoing(out.map((r) => hydrate(r, "outgoing")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function accept(id: string) {
    setBusyId(id);
    try {
      await coffeeService.respond(id, { action: "accept" });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function decline(id: string) {
    setBusyId(id);
    try {
      await coffeeService.respond(id, { action: "decline" });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await coffeeService.cancel(id);
      await reload();
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
        <Coffee className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground mb-4">
          No coffee invites yet — open someone's profile and click "Grab a coffee" to start.
        </p>
        <Button asChild>
          <Link to="/people">Find people</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {incoming.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            Waiting for your response
          </h3>
          <div className="space-y-2">
            {incoming.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 p-3 border rounded-lg bg-card"
              >
                <Avatar>
                  {r.requesterAvatarUrl ? (
                    <AvatarImage src={r.requesterAvatarUrl} alt={r.requesterName ?? ""} />
                  ) : null}
                  <AvatarFallback>{r.requesterName?.charAt(0) ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    <Link to={`/people/${r.requesterUserId}`} className="hover:underline">
                      {r.requesterName ?? "Someone"}
                    </Link>{" "}
                    wants to grab coffee
                  </div>
                  {r.message && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                      "{r.message}"
                    </p>
                  )}
                  {r.proposedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Proposed: {new Date(r.proposedAt).toLocaleString()}
                      {r.proposedLocation ? ` · ${r.proposedLocation}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    size="sm"
                    onClick={() => accept(r.id)}
                    disabled={busyId === r.id}
                  >
                    {busyId === r.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decline(r.id)}
                    disabled={busyId === r.id}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            Your invites
          </h3>
          <div className="space-y-2">
            {outgoing.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 p-3 border rounded-lg bg-card"
              >
                <Avatar>
                  {r.recipientAvatarUrl ? (
                    <AvatarImage src={r.recipientAvatarUrl} alt={r.recipientName ?? ""} />
                  ) : null}
                  <AvatarFallback>{r.recipientName?.charAt(0) ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    <Link to={`/people/${r.recipientUserId}`} className="hover:underline">
                      {r.recipientName ?? "Recipient"}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    <CoffeeStatusBadge status={r.status} />
                    {r.status === "accepted" && r.acceptedEventId && (
                      <Link
                        to={`/events/${r.acceptedEventId}`}
                        className="text-blue-600 hover:underline flex items-center"
                      >
                        View event
                        <ArrowRight className="w-3 h-3 ml-0.5" />
                      </Link>
                    )}
                  </div>
                </div>
                {r.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancel(r.id)}
                    disabled={busyId === r.id}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CoffeeStatusBadge({ status }: { status: CoffeeRequest["status"] }) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "accepted":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Accepted</Badge>;
    case "declined":
      return <Badge variant="outline">Declined</Badge>;
    case "cancelled":
      return <Badge variant="outline">Cancelled</Badge>;
    case "expired":
      return <Badge variant="outline">Expired</Badge>;
  }
}
