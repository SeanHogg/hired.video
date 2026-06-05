/**
 * /bookings — host config + reservation dashboard.
 *
 * Auth required. Three sections:
 *   1. Offerings (catalog CRUD)
 *   2. Availability (recurring weekly rules)
 *   3. Reservations (list + mark-paid + cancel)
 *
 * Gates on the Creator bookings program: if the user hasn't enabled it,
 * the page renders a one-click enrollment CTA that opts them in via
 * the existing /api/creators routes.
 *
 * Reference: gap #1648.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  addAvailabilityRule,
  cancelOwnedReservation,
  createOffering,
  deleteAvailabilityRule,
  deleteOffering,
  fetchOwnHost,
  listAvailabilityRules,
  listOwnedOfferings,
  listOwnedReservations,
  markReservationPaid,
} from "@/lib/services/bookings-service";
import { BOOKING_DURATIONS_MINUTES } from "@shared/bookings";
import { apiClient } from "@/lib/api-client";

// Stable i18n keys (Sun…Sat) resolved at render with t(); no t() at module scope.
const WEEKDAY_NAME_KEYS = [
  "labels.bookings.weekday.sun",
  "labels.bookings.weekday.mon",
  "labels.bookings.weekday.tue",
  "labels.bookings.weekday.wed",
  "labels.bookings.weekday.thu",
  "labels.bookings.weekday.fri",
  "labels.bookings.weekday.sat",
];

export default function BookingsHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("headings.bookings.title"), url: "/bookings" }]);

  const [host, setHost] = useState<Awaited<ReturnType<typeof fetchOwnHost>> | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostLoading, setHostLoading] = useState(true);

  const [offerings, setOfferings] = useState<Awaited<ReturnType<typeof listOwnedOfferings>>>([]);
  const [rules, setRules] = useState<Awaited<ReturnType<typeof listAvailabilityRules>>>([]);
  const [reservations, setReservations] = useState<Awaited<
    ReturnType<typeof listOwnedReservations>
  >>([]);

  // New-offering form state
  const [offName, setOffName] = useState("");
  const [offSlug, setOffSlug] = useState("");
  const [offDuration, setOffDuration] = useState<number>(30);
  const [offPriceCents, setOffPriceCents] = useState<number>(0);
  const [offDesc, setOffDesc] = useState("");
  const [offMeetLink, setOffMeetLink] = useState("");

  // New-rule form state
  const [ruleWeekday, setRuleWeekday] = useState(1);
  const [ruleStart, setRuleStart] = useState("09:00");
  const [ruleEnd, setRuleEnd] = useState("17:00");

  const reload = useCallback(async () => {
    try {
      const [o, r, res] = await Promise.all([
        listOwnedOfferings(),
        listAvailabilityRules(),
        listOwnedReservations(),
      ]);
      setOfferings(o);
      setRules(r);
      setReservations(res);
    } catch (e: any) {
      toast({ title: t("errors.bookings.loadDataFailed"), description: e?.message });
    }
  }, [toast, t]);

  useEffect(() => {
    let cancelled = false;
    setHostLoading(true);
    fetchOwnHost()
      .then((h) => !cancelled && setHost(h))
      .catch((e) => !cancelled && setHostError(e?.message ?? "Not enrolled"))
      .finally(() => !cancelled && setHostLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (host?.bookingsActive) {
      void reload();
    }
  }, [host?.bookingsActive, reload]);

  async function enableBookings() {
    try {
      await apiClient.post("/api/creators/opt-in", {
        programs: ["bookings"],
        acceptedTerms: true,
      });
      await apiClient.post("/api/creators/me/programs/bookings", {});
      const h = await fetchOwnHost();
      setHost(h);
      setHostError(null);
      toast({ title: t("messages.bookings.enabled") });
    } catch (e: any) {
      toast({
        title: t("errors.bookings.enableFailed"),
        description: e?.message ?? t("messages.tryAgainLater"),
        variant: "destructive",
      });
    }
  }

  async function handleCreateOffering() {
    if (!offName.trim() || !offSlug.trim()) {
      toast({ title: t("errors.bookings.nameSlugRequired") });
      return;
    }
    try {
      await createOffering({
        name: offName.trim(),
        slug: offSlug.trim().toLowerCase().replace(/\s+/g, "-"),
        durationMinutes: offDuration as 30 | 60 | 90 | 120,
        priceCents: offPriceCents,
        currency: "USD",
        descriptionMd: offDesc,
        videoConferenceLink: offMeetLink.trim() || null,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        displayOrder: 0,
        isActive: true,
      });
      setOffName("");
      setOffSlug("");
      setOffDesc("");
      setOffMeetLink("");
      setOffPriceCents(0);
      await reload();
      toast({ title: t("messages.bookings.offeringCreated") });
    } catch (e: any) {
      toast({ title: t("errors.bookings.createFailed"), description: e?.message });
    }
  }

  async function handleDeleteOffering(id: string) {
    try {
      await deleteOffering(id);
      await reload();
    } catch (e: any) {
      toast({ title: t("errors.bookings.deactivateFailed"), description: e?.message });
    }
  }

  async function handleAddRule() {
    if (ruleEnd <= ruleStart) {
      toast({ title: t("errors.bookings.endAfterStart") });
      return;
    }
    try {
      await addAvailabilityRule({
        weekday: ruleWeekday,
        startTimeLocal: ruleStart,
        endTimeLocal: ruleEnd,
      });
      await reload();
    } catch (e: any) {
      toast({ title: t("errors.bookings.addRuleFailed"), description: e?.message });
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await deleteAvailabilityRule(id);
      await reload();
    } catch (e: any) {
      toast({ title: t("errors.bookings.deleteRuleFailed"), description: e?.message });
    }
  }

  async function handleMarkPaid(id: string) {
    try {
      await markReservationPaid(id);
      await reload();
    } catch (e: any) {
      toast({ title: "Could not confirm", description: e?.message });
    }
  }

  async function handleCancelReservation(id: string) {
    if (!confirm("Cancel this reservation?")) return;
    try {
      await cancelOwnedReservation(id, { reason: null });
      await reload();
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e?.message });
    }
  }

  const publicUrl = useMemo(() => (host ? `/book/${host.handle}` : null), [host]);

  if (hostLoading) {
    return (
      <AppShell>
        <div className="container py-12 text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!host || hostError || !host.bookingsActive) {
    return (
      <AppShell>
        <div className="container py-12 max-w-xl">
          <h1 className="text-2xl font-semibold">Offer 1:1 sessions</h1>
          <p className="text-muted-foreground mt-2">
            Enable the Bookings program to publish a calendar your audience can book directly.
          </p>
          <Button className="mt-4" onClick={enableBookings}>
            Enable bookings
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container py-8 space-y-8 max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Bookings</h1>
            <p className="text-sm text-muted-foreground">
              Your public booking page:{" "}
              {publicUrl ? (
                <button
                  className="underline"
                  onClick={() => navigate(publicUrl)}
                  type="button"
                >
                  {publicUrl}
                </button>
              ) : (
                "Set a public handle on your profile first."
              )}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Session offerings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {offerings.length === 0 && (
              <p className="text-sm text-muted-foreground">No offerings yet — add your first below.</p>
            )}
            {offerings.map((o) => (
              <div key={o.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {o.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({o.durationMinutes} min ·{" "}
                      {o.priceCents === 0 ? "Free" : `${(o.priceCents / 100).toFixed(2)} ${o.currency}`})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{o.slug}</div>
                </div>
                <Button
                  size="sm"
                  variant={o.isActive ? "destructive" : "outline"}
                  onClick={() => handleDeleteOffering(o.id)}
                >
                  {o.isActive ? "Deactivate" : "Inactive"}
                </Button>
              </div>
            ))}
            <div className="border-t pt-4 grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="off-name">Name</Label>
                <Input
                  id="off-name"
                  value={offName}
                  onChange={(e) => setOffName(e.target.value)}
                  placeholder="30-min coaching"
                />
              </div>
              <div>
                <Label htmlFor="off-slug">URL slug</Label>
                <Input
                  id="off-slug"
                  value={offSlug}
                  onChange={(e) => setOffSlug(e.target.value)}
                  placeholder="30-min-coaching"
                />
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={String(offDuration)} onValueChange={(v) => setOffDuration(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_DURATIONS_MINUTES.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="off-price">Price (USD)</Label>
                <Input
                  id="off-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={(offPriceCents / 100).toString()}
                  onChange={(e) => setOffPriceCents(Math.round(Number(e.target.value) * 100))}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="off-desc">Description</Label>
                <Textarea
                  id="off-desc"
                  value={offDesc}
                  onChange={(e) => setOffDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="off-meet">Meeting link (Zoom / Meet / Whereby)</Label>
                <Input
                  id="off-meet"
                  value={offMeetLink}
                  onChange={(e) => setOffMeetLink(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="md:col-span-2">
                <Button onClick={handleCreateOffering}>Add offering</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.length === 0 && (
              <p className="text-sm text-muted-foreground">No rules yet — add at least one window.</p>
            )}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="text-sm">
                  {t(WEEKDAY_NAME_KEYS[r.weekday] ?? "")} · {r.startTimeLocal.slice(0, 5)}–
                  {r.endTimeLocal.slice(0, 5)}
                </div>
                <Button size="sm" variant="outline" onClick={() => handleDeleteRule(r.id)}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-2 items-end">
              <div>
                <Label>Day</Label>
                <Select
                  value={String(ruleWeekday)}
                  onValueChange={(v) => setRuleWeekday(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_NAME_KEYS.map((k, i) => (
                      <SelectItem key={k} value={String(i)}>
                        {t(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rule-start">Start</Label>
                <Input
                  id="rule-start"
                  type="time"
                  value={ruleStart}
                  onChange={(e) => setRuleStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rule-end">End</Label>
                <Input
                  id="rule-end"
                  type="time"
                  value={ruleEnd}
                  onChange={(e) => setRuleEnd(e.target.value)}
                />
              </div>
              <Button onClick={handleAddRule}>Add window</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reservations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reservations.length === 0 && (
              <p className="text-sm text-muted-foreground">No reservations yet.</p>
            )}
            {reservations.map((r) => (
              <div key={r.id} className="flex items-start justify-between border rounded-md p-3">
                <div className="text-sm space-y-1">
                  <div className="font-medium">{r.offeringName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.slotStartUtc).toLocaleString()} · {r.durationMinutes} min
                  </div>
                  <div className="text-xs">
                    {r.bookerName} &lt;{r.bookerEmail}&gt; · {r.status}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.status === "pending_payment" && (
                    <Button size="sm" onClick={() => handleMarkPaid(r.id)}>
                      Mark paid
                    </Button>
                  )}
                  {(r.status === "pending_payment" || r.status === "confirmed") && (
                    <Button size="sm" variant="destructive" onClick={() => handleCancelReservation(r.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
