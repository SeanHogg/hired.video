/**
 * Self-gating Bookings section for /people/[id].
 *
 * Per the DRY rule: the consumer renders <BookingsSection handle={...} />
 * unconditionally. The component queries /api/bookings/public/host/:handle
 * and returns null when:
 *   - the handle is missing,
 *   - the host has no active bookings program,
 *   - the host has no active offerings.
 *
 * `bookingsActive` is a cheap enrollment flag the profile DTO already
 * carries (creator_profiles.bookings_active). When it is explicitly false
 * we short-circuit BEFORE the network call, so the overwhelming majority of
 * (non-host) profile views no longer fire a guaranteed-404 round-trip. When
 * it is undefined (caller didn't supply it) we fall back to the fetch so the
 * component stays self-gating for any consumer. The offerings list still
 * comes from the endpoint — the flag only gates whether we bother asking.
 *
 * No prop-drilled `canBookSessions` boolean: `bookingsActive` is a passed-
 * through data field, and the visibility decision (return null) lives here.
 *
 * Reference: gap #1648.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPublicHost } from "@/lib/services/bookings-service";
import type { PublicHostProfileDTO } from "@shared/bookings";

interface Props {
  /** The viewed user's external_public_handle. Empty string / null is fine —
   *  the component handles the no-handle case. */
  handle: string | null | undefined;
  /** Cheap enrollment flag from the profile DTO. When explicitly `false`,
   *  the component skips the public-host fetch entirely. `undefined` means
   *  "unknown" → fall back to fetching (preserves self-gating for callers
   *  that don't carry the flag). */
  bookingsActive?: boolean;
}

export function BookingsSection({ handle, bookingsActive }: Props) {
  const [host, setHost] = useState<PublicHostProfileDTO | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!handle || bookingsActive === false) {
      setDone(true);
      return;
    }
    let cancelled = false;
    fetchPublicHost(handle)
      .then((h) => !cancelled && setHost(h))
      .catch(() => {})
      .finally(() => !cancelled && setDone(true));
    return () => {
      cancelled = true;
    };
  }, [handle, bookingsActive]);

  if (!done) return null;
  if (!host) return null;
  const active = host.offerings.filter((o) => o.isActive);
  if (active.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book a 1:1 session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.map((o) => (
          <div key={o.id} className="flex justify-between items-center border rounded-md p-3">
            <div>
              <div className="font-medium">{o.name}</div>
              <div className="text-xs text-muted-foreground">
                {o.durationMinutes} min ·{" "}
                {o.priceCents === 0 ? "Free" : `${(o.priceCents / 100).toFixed(2)} ${o.currency}`}
              </div>
            </div>
            <Button asChild size="sm">
              <Link to={`/book/${encodeURIComponent(host.handle)}?offering=${o.slug}`}>
                Book
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
