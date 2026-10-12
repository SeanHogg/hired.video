import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  resolveProfileSections,
  type ProfileSectionKey,
  type ProfileSections,
  type StoredProfileSections,
} from "../../../../shared/profile-sections";

const ProfileSectionsContext = createContext<ProfileSections | null>(null);

interface ProviderProps {
  stored: StoredProfileSections | Record<string, boolean> | null | undefined;
  role: string | null | undefined;
  children: ReactNode;
}

export function ProfileSectionsProvider({ stored, role, children }: ProviderProps) {
  const value = useMemo(
    () => resolveProfileSections((stored ?? null) as StoredProfileSections | null, role),
    [stored, role],
  );
  return <ProfileSectionsContext.Provider value={value}>{children}</ProfileSectionsContext.Provider>;
}

export function useProfileSectionVisibility(key: ProfileSectionKey): boolean {
  const ctx = useContext(ProfileSectionsContext);
  // Outside the provider (or before profile loads), assume visible. This
  // keeps sections backwards-compatible anywhere they render without the
  // gate (avatar previews, embedded admin views, etc.).
  if (!ctx) return true;
  return ctx[key];
}
