/**
 * /events/new — host an event.
 *
 * Single-page form (not a multi-step wizard) because the v1 field set
 * is small enough to fit comfortably above the fold for desktop.
 * Wizard-fication is tracked as a follow-on if the field count grows
 * (recurring series, ticketing, custom registration questions are all
 * deferred per gap #1246/1247).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { eventsService, type EventCategory } from "@/lib/services/events-service";
import { useAuth } from "@/lib/auth";
import type {
  CreateEventInput,
  EventFormat,
  EventVisibility,
  VideoProvider,
} from "@shared/events";

export default function EventNew() {
  useSEO("/events/new");
  useBreadcrumbs([
    { name: "Events", url: "/tasks?surface=discover" },
    { name: "Host an event", url: "/events/new" },
  ]);

  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [eventFormat, setEventFormat] = useState<EventFormat>("in_person");
  const [visibility, setVisibility] = useState<EventVisibility>("public");
  const [category, setCategory] = useState<string>("");
  const [location, setLocation] = useState("");
  const [videoProvider, setVideoProvider] = useState<VideoProvider | "">("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [capacity, setCapacity] = useState<string>("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [allowsPlusOnes, setAllowsPlusOnes] = useState(false);
  const [matchmakingEnabled, setMatchmakingEnabled] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?next=/events/new");
      return;
    }
    eventsService.listCategories().then(setCategories).catch(() => {});
  }, [isAuthenticated, navigate]);

  async function submit(publish: boolean) {
    setError(null);
    if (!title.trim() || !startAt || !endAt) {
      setError("Title, start, and end times are required.");
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setError("End time must be after start time.");
      return;
    }

    const input: CreateEventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      type: "event",
      visibility,
      eventFormat,
      category: category || undefined,
      location: location.trim() || undefined,
      videoProvider: videoProvider || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      allowsPlusOnes,
      requiresApproval,
      matchmakingEnabled,
      coHostUserIds: [],
      publish,
    };

    setBusy(true);
    try {
      const created = await eventsService.create(input);
      navigate(`/events/${created.slug ?? created.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Could not create event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Host an event</h1>
        <p className="text-muted-foreground mb-6">
          In-person, remote, or hybrid — invite anyone, accept RSVPs, and meet the right people.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-800 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Backend engineers coffee chat — May 31"
                maxLength={500}
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="What is this event about? Who should come?"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start">Start *</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end">End *</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.slug}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as EventVisibility)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public (discoverable)</SelectItem>
                    <SelectItem value="unlisted">Unlisted (link only)</SelectItem>
                    <SelectItem value="private">Private (invited only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Format & location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Format</Label>
              <Select value={eventFormat} onValueChange={(v) => setEventFormat(v as EventFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">In-person</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(eventFormat === "in_person" || eventFormat === "hybrid") && (
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Venue, address, or neighborhood"
                />
              </div>
            )}
            {(eventFormat === "remote" || eventFormat === "hybrid") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Video provider</Label>
                  <Select
                    value={videoProvider || "none"}
                    onValueChange={(v) => setVideoProvider(v === "none" ? "" : (v as VideoProvider))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="meet">Google Meet</SelectItem>
                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="meetingUrl">Meeting URL</Label>
                  <Input
                    id="meetingUrl"
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>RSVPs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="capacity">Capacity (optional)</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Leave blank for unlimited"
              />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="approval"
                checked={requiresApproval}
                onCheckedChange={(v) => setRequiresApproval(Boolean(v))}
              />
              <div>
                <Label htmlFor="approval">Require host approval</Label>
                <p className="text-sm text-muted-foreground">
                  RSVPs land as "pending" until you approve. Best for curated networking events.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="plusone"
                checked={allowsPlusOnes}
                onCheckedChange={(v) => setAllowsPlusOnes(Boolean(v))}
              />
              <div>
                <Label htmlFor="plusone">Allow +1s</Label>
                <p className="text-sm text-muted-foreground">
                  Attendees can bring up to one guest.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="match"
                checked={matchmakingEnabled}
                onCheckedChange={(v) => setMatchmakingEnabled(Boolean(v))}
              />
              <div>
                <Label htmlFor="match">Enable AI introductions</Label>
                <p className="text-sm text-muted-foreground">
                  Default on. Suggests who each attendee should meet based on complementary skills.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => submit(false)} disabled={busy}>
            Save draft
          </Button>
          <Button onClick={() => submit(true)} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Publish event
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
