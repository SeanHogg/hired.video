// initials — render up to two uppercase initials from a person's name. Used
// across recruiter / pipeline / hiring-manager-portal surfaces.

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const tokens = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return (
    tokens
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}
