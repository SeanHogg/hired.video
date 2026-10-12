import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PitchSummary } from "@shared/pitch";
import { useAuth } from "@/lib/auth";
import {
  dashboardService,
  type SeekerAnalytics,
} from "@/lib/services/dashboard-service";
import { recruiterService } from "@/lib/services/recruiter-service";
import { resumeService } from "@/lib/services/resume-service";
import { studioService, type UserVideo } from "@/lib/services/studio-service";
import { userService, type UserProfile } from "@/lib/services/user-service";
import { createRolePermissions } from "@/lib/role-utils";
import { getCurrentPitch } from "@/lib/services/video-pitch-service";
import { CURRENT_PITCH_QUERY_KEY } from "@/hooks/use-pitch-project";
import type { Resume } from "@/types/resume";

// ---------------------------------------------------------------------------
// Types — the ProfileView aggregate (DDD): one read-model that captures
// everything a profile page needs, parameterised by whether the viewer owns
// the profile.
// ---------------------------------------------------------------------------

export type ProfileViewTarget = string | "me";

export type ConnectionRelationship =
  | { status: "none"; id: null }
  | { status: "pending_sent" | "pending_received" | "connected"; id: string };

export interface ProfileView {
  /** The target user. `null` while loading or if the profile could not be
   *  fetched. */
  profile: UserProfile | null;
  /** Full master resume (content included) — null if none published or
   *  viewer isn't allowed to see it. */
  masterResume: Resume | null;
  /** Published studio videos. Never private; public for all viewers. */
  videos: UserVideo[];
  /** The profile's current video pitch (#2133). Visitors get it from the
   *  profile DTO; the owner reads the shared current-pitch query so a change
   *  in Video Pitch Lab shows up here without a reload. */
  pitch: PitchSummary | null;
  /** True when the authenticated viewer is the profile owner. */
  isOwner: boolean;
  /** Connection relationship from viewer → owner. Always `{status: "none"}`
   *  when viewing own profile or unauthenticated. */
  connection: ConnectionRelationship;
  /** Whether this owner is in the recruiter-viewer's talent pool. `null`
   *  means not checked (viewer isn't a recruiter, or viewing own profile). */
  inTalentPool: boolean | null;
  /** Owner-only: dashboard read model (profile stats, app stats, matches,
   *  upcoming interviews). Always null for visitors. */
  dashboard: unknown | null;
  /** Owner-only: seeker analytics matching the Chrome-extension tab. */
  seekerAnalytics: SeekerAnalytics | null;
  loading: boolean;
  error: string | null;
  /** Refetch the entire aggregate — used after owner edits. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchTargetProfile(
  target: ProfileViewTarget,
  authUser: UserProfile | null | undefined,
): Promise<UserProfile | null> {
  if (target === "me") {
    // "me" uses the already-loaded auth user — no extra API hop.
    return (authUser as UserProfile | null) ?? null;
  }
  const clean = target.startsWith("person-") ? target.slice("person-".length) : target;
  try {
    return await userService.getUserById(clean);
  } catch (err) {
    console.error("useProfileView: failed to load profile", err);
    throw err;
  }
}

// Resolve the master resume (with full content). For the owner we use the
// auth-scoped endpoint, which returns both public and private resumes; for
// visitors we use the public-only endpoint, so a private master simply
// reads as "no resume available" rather than a 403.
async function fetchMasterResume(
  profile: UserProfile,
  isOwner: boolean,
): Promise<Resume | null> {
  try {
    if (isOwner) {
      const resumes = await resumeService.getUserResumes();
      const master = resumes.find(
        (r: any) => r.isMaster === true || r.IsMaster === true,
      );
      const resumeId = (master as any)?.id ?? (master as any)?.Id;
      if (!resumeId) return null;
      return await resumeService.getResumeById(resumeId);
    }
    const summaries = await resumeService.getResumesByUserId(profile.id!);
    const master = summaries.find((r) => r.isMaster === true);
    if (!master) return null;
    // Public-resume endpoint bypasses auth and honours privacy.
    try {
      return await resumeService.getPublicResume(master.slug ?? master.id);
    } catch {
      return null;
    }
  } catch (err) {
    console.error("useProfileView: failed to load master resume", err);
    return null;
  }
}

async function fetchConnection(
  viewerId: string,
  profileId: string,
): Promise<ConnectionRelationship> {
  try {
    const result = await userService.getConnectionStatus(viewerId, profileId);
    if (!result.connected) return { status: "none", id: null };
    if (result.status === "accepted") return { status: "connected", id: result.id };
    if (result.status === "pending") {
      return {
        status: result.fromUserId === viewerId ? "pending_sent" : "pending_received",
        id: result.id,
      };
    }
    return { status: "none", id: null };
  } catch {
    return { status: "none", id: null };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProfileView(target: ProfileViewTarget): ProfileView {
  const { user: authUser, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [masterResume, setMasterResume] = useState<Resume | null>(null);
  const [videos, setVideos] = useState<UserVideo[]>([]);
  const [connection, setConnection] = useState<ConnectionRelationship>({
    status: "none",
    id: null,
  });
  const [inTalentPool, setInTalentPool] = useState<boolean | null>(null);
  const [dashboard, setDashboard] = useState<unknown | null>(null);
  const [seekerAnalytics, setSeekerAnalytics] = useState<SeekerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwner = useMemo(() => {
    if (!profile || !authUser) return false;
    return profile.id === authUser.id;
  }, [profile, authUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchTargetProfile(target, authUser as any);
      setProfile(loaded);
      if (!loaded) {
        setMasterResume(null);
        setVideos([]);
        setConnection({ status: "none", id: null });
        setInTalentPool(null);
        setDashboard(null);
        setSeekerAnalytics(null);
        setError("User not found");
        return;
      }

      const viewerIsOwner = !!authUser && loaded.id === authUser.id;
      const viewerId = authUser?.id;

      // Fan out secondary fetches in parallel — they're all independent.
      // Services moved into <ProfileServicesPanel/> which self-fetches the
      // active list for the relevant audience.
      const [resume, videoRes, rel] = await Promise.all([
        fetchMasterResume(loaded, viewerIsOwner),
        loaded.id ? studioService.getVideosForUser(loaded.id) : Promise.resolve({ data: [] as UserVideo[] }),
        !viewerIsOwner && viewerId && loaded.id
          ? fetchConnection(viewerId, loaded.id)
          : Promise.resolve<ConnectionRelationship>({ status: "none", id: null }),
      ]);

      setMasterResume(resume);
      setVideos(videoRes.data ?? []);
      setConnection(rel);

      // Recruiter-only: talent-pool membership check.
      if (!viewerIsOwner && authUser && loaded.id) {
        const viewerPerms = createRolePermissions((authUser as any).role);
        if (viewerPerms.isRecruiter) {
          try {
            const inPool = await recruiterService.checkInTalentPool(loaded.id);
            setInTalentPool(inPool);
          } catch {
            setInTalentPool(null);
          }
        } else {
          setInTalentPool(null);
        }
      } else {
        setInTalentPool(null);
      }

      // Owner-only extras: dashboard + seeker analytics.
      if (viewerIsOwner) {
        try {
          const dd = await dashboardService.getDashboardForRole(
            (authUser as any).role,
          );
          setDashboard((dd as any)?.data ?? dd ?? null);
        } catch {
          setDashboard(null);
        }
        const viewerPerms = createRolePermissions((authUser as any).role);
        if (viewerPerms.isJobSeeker) {
          const analytics = await dashboardService.getSeekerAnalytics();
          setSeekerAnalytics(analytics);
        } else {
          setSeekerAnalytics(null);
        }
      } else {
        setDashboard(null);
        setSeekerAnalytics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, authUser?.id, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  const { data: ownPitch = null } = useQuery({
    queryKey: CURRENT_PITCH_QUERY_KEY,
    queryFn: getCurrentPitch,
    enabled: isOwner,
  });
  const pitch = isOwner ? ownPitch : (profile?.pitch ?? null);

  return {
    profile,
    masterResume,
    videos,
    pitch,
    isOwner,
    connection,
    inTalentPool,
    dashboard,
    seekerAnalytics,
    loading,
    error,
    refetch: load,
  };
}
