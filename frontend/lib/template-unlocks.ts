// Lightweight "unlocked templates" store — first pass is localStorage.
// Server-backed ownership (templateLicenses table) lands with the marketplace
// phase; until then this lets us ship the Add-to-Cart / Use-Free flow end-to-end.

const KEY = "hired.unlocked_templates.v1";

export function getUnlockedTemplates(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isTemplateUnlocked(templateId: string): boolean {
  return getUnlockedTemplates().includes(templateId);
}

export function unlockTemplate(templateId: string): void {
  const current = getUnlockedTemplates();
  if (current.includes(templateId)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...current, templateId]));
    window.dispatchEvent(new CustomEvent("hired:template-unlocked", { detail: templateId }));
  } catch {}
}
