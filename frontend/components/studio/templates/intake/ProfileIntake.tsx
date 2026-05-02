// Intake for "Promote Yourself" — fetches the user's profile and (if they
// are a service provider) their service offerings, lets them pick which
// pieces to include, and serializes the chosen content into resumeText
// for the storyboard generator.

import { useEffect, useState } from "react";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { userService, type UserProfile } from "@/lib/services/user-service";
import { servicesService, type ServiceOffering } from "@/lib/services/services-service";
import type { IntakeProps } from "../catalog";

function profileToText(p: UserProfile, services: ServiceOffering[]): string {
  const lines: string[] = [];
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  const headline = p.data?.headline ?? "";
  if (fullName || headline) lines.push(fullName + (headline ? ` — ${headline}` : ""));

  const role = p.currentRole ?? p.data?.currentRole;
  const company = p.currentCompany ?? p.data?.currentCompany;
  if (role || company) lines.push(`${role ?? ""}${role && company ? " at " : ""}${company ?? ""}`);

  const summary = p.data?.summary ?? p.bio;
  if (summary) lines.push(`\nSummary:\n${summary}`);

  const skills = p.data?.skills ?? p.skills;
  if (skills?.length) lines.push(`\nSkills: ${skills.join(", ")}`);

  if (services.length) {
    lines.push("\nServices Offered:");
    for (const s of services) {
      const price = s.priceVisible && s.priceCents != null
        ? ` — $${(s.priceCents / 100).toFixed(0)}`
        : "";
      const delivery = s.deliveryDays != null ? ` (${s.deliveryDays}d delivery)` : "";
      lines.push(`• ${s.title}${price}${delivery}`);
      if (s.description) lines.push(`  ${s.description}`);
    }
  }

  return lines.join("\n");
}

function profileUrl(p: UserProfile): string | null {
  const handle = p.slug ?? p.id;
  return handle ? `https://hired.video/people/${handle}` : null;
}

export default function ProfileIntake({ state, onStateChange }: IntakeProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includedServiceIds, setIncludedServiceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, svc] = await Promise.all([
          userService.getCurrentUser(),
          servicesService.listMyServices().catch(() => [] as ServiceOffering[]),
        ]);
        if (cancelled) return;
        setProfile(p);
        const active = svc.filter((s) => s.isActive);
        setServices(active);
        setIncludedServiceIds(new Set(active.map((s) => s.id)));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-serialize whenever profile or selection changes.
  useEffect(() => {
    if (!profile) return;
    const picked = services.filter((s) => includedServiceIds.has(s.id));
    onStateChange({ resumeText: profileToText(profile, picked) });
  }, [profile, services, includedServiceIds]);

  function toggleService(id: string) {
    setIncludedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your profile…
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="p-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
        {error ?? "Couldn't load your profile."}
      </div>
    );
  }

  const url = profileUrl(profile);
  const summary = profile.data?.summary ?? profile.bio ?? "";

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3">
        {profile.profilePicture && (
          <img
            src={profile.profilePicture}
            alt=""
            className="w-12 h-12 rounded-full object-cover border"
            crossOrigin="anonymous"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">
            {[profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Your profile"}
          </p>
          {profile.data?.headline && (
            <p className="text-xs text-muted-foreground truncate">{profile.data.headline}</p>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
            >
              {url.replace(/^https?:\/\//, "")}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block">Summary</Label>
        <Textarea
          className="h-24 resize-none text-xs"
          value={summary}
          onChange={(e) => {
            // Apply summary edit back to the serialized text directly.
            const updated: UserProfile = {
              ...profile,
              bio: e.target.value,
              data: profile.data ? { ...profile.data, summary: e.target.value } : profile.data,
            };
            setProfile(updated);
          }}
          placeholder="What do you want viewers to know about you?"
        />
      </div>

      {services.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Services to feature</Label>
            <span className="text-[10px] text-muted-foreground">
              {includedServiceIds.size} of {services.length} included
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {services.map((s) => {
              const on = includedServiceIds.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={cn(
                      "w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg border transition-colors",
                      on
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-accent",
                    )}
                  >
                    <div className={cn(
                      "shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center",
                      on ? "bg-primary border-primary" : "border-muted-foreground/40",
                    )}>
                      {on && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate">{s.title}</span>
                        {s.priceVisible && s.priceCents != null && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            ${(s.priceCents / 100).toFixed(0)}
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground border border-dashed rounded-md px-3 py-2">
          No active services on your profile. Set up service offerings under
          {" "}<span className="font-medium">/services</span> to feature them in this video.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground leading-snug">
        We'll use the selected pieces above as context for the AI script. You
        can fine-tune the storyboard after generation.
      </p>
      {/* state.resumeText keeps the latest serialization in sync — no preview
          here to avoid showing the raw markup we feed into the model. */}
      {state.resumeText && (
        <span className="sr-only" aria-hidden="true">{state.resumeText.length}</span>
      )}
    </div>
  );
}
