/**
 * ProfileInlineBody — renders a user's own profile inside a
 * `linked-content` canvas widget. Single profile per user (singular,
 * not a list) — the palette section surfaces one tile for "Your
 * Profile" and dropping it embeds a hero-style profile card.
 *
 * Visual mirrors the `/people/:id` hero (avatar + name + headline +
 * current role · company + summary + skills chips). No
 * `<DeclarativePeopleRenderer/>` exists in the codebase yet — when
 * one lands this body migrates to it the same way `ResumeInlineBody`
 * uses `<DeclarativeResumeRenderer/>`.
 */
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { userService, type UserProfile } from "@/lib/services/user-service";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface ProfileInlineBodyProps {
  /** User id — when this matches the auth'd user we read the rich
   *  `getCurrentUser()` row directly; otherwise fall through to
   *  `getUserById()` so the same component renders other people's
   *  profiles too (future "drop a teammate's profile into a recruiter
   *  pitch" flow). */
  id: string;
}

export default function ProfileInlineBody({ id }: ProfileInlineBodyProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    // Try the auth'd "current user" path first — richer payload (data
    // sub-object, full skills, verified flags). Fall back to the
    // public `getUserById` when the widget binds a different user.
    userService
      .getCurrentUser()
      .then((me) => {
        if (cancelled) return;
        if (me && (me.id === id || !id)) {
          setProfile(me);
          setLoadState("ready");
          return;
        }
        return userService.getUserById(id).then((u) => {
          if (cancelled) return;
          setProfile(u);
          setLoadState(u ? "ready" : "error");
        });
      })
      .catch(async () => {
        try {
          const u = await userService.getUserById(id);
          if (cancelled) return;
          setProfile(u);
          setLoadState(u ? "ready" : "error");
        } catch {
          if (cancelled) return;
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading profile…" />;
  if (loadState === "error" || !profile) {
    return <InlineBodyMessage label="Couldn't load this profile." />;
  }

  const data = profile.data ?? {};
  const fullName =
    [data.firstName ?? profile.firstName, data.lastName ?? profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Unnamed profile";
  const initial = (fullName.charAt(0) || "?").toUpperCase();
  const headline = data.headline ?? "";
  const role = data.currentRole ?? profile.currentRole ?? "";
  const company = data.currentCompany ?? profile.currentCompany ?? "";
  const location = data.location ?? profile.location ?? "";
  const summary = data.summary ?? "";
  const skills: string[] =
    (data.skills as string[] | undefined) ??
    (profile.skills as string[] | undefined) ??
    [];
  const avatarUrl = data.avatar ?? profile.profilePicture ?? undefined;

  return (
    <ScaledTemplateFrame>
      <section className="bg-white px-10 py-8 text-slate-900">
        <header className="mb-6 flex items-center gap-6">
          <Avatar className="h-24 w-24 ring-4 ring-indigo-100">
            <AvatarImage src={avatarUrl} alt={fullName} />
            <AvatarFallback className="bg-indigo-600 text-2xl font-bold text-white">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-bold leading-tight">{fullName}</h1>
            {headline && (
              <p className="mt-1 text-base text-slate-600">{headline}</p>
            )}
            {(role || company) && (
              <p className="mt-1 text-sm text-slate-500">
                {role}
                {role && company ? " · " : ""}
                {company}
              </p>
            )}
            {location && (
              <p className="mt-1 text-xs text-slate-400">{location}</p>
            )}
          </div>
        </header>
        {summary && (
          <p className="mb-6 text-sm leading-relaxed text-slate-700">
            {summary}
          </p>
        )}
        {skills.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Skills
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {skills.slice(0, 16).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </ScaledTemplateFrame>
  );
}
