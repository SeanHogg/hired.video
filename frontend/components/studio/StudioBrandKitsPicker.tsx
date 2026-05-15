// Self-contained picker for Studio Brand Kits (colours / logo / font that
// the storyboard endpoint applies to generated VideoScripts). Owns its own
// fetch, list, create, delete, and Pro-gate via `useSubscription` — callers
// just pass the currently-selected id + an onChange. No `canEdit` /
// `isPro` props plumbed down from the parent.

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/hooks/useSubscription";
import {
  studioService,
  type StudioBrandKit,
  type StudioBrandKitInput,
} from "@/lib/services/studio-service";

interface Props {
  /** Currently-selected brand kit id. Null = "no kit" (raw template colours). */
  value: string | null;
  onChange: (next: string | null) => void;
}

const DEFAULT_DRAFT: Required<Pick<StudioBrandKitInput, "name" | "primaryColor" | "secondaryColor" | "accentColor" | "fontFamily">> & { logoUrl: string } = {
  name: "My Brand",
  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",
  accentColor: "#14b8a6",
  fontFamily: "Inter",
  logoUrl: "",
};

export default function StudioBrandKitsPicker({ value, onChange }: Props) {
  const { isPro } = useSubscription();
  const { toast } = useToast();
  const [kits, setKits] = useState<StudioBrandKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    studioService
      .listBrandKits()
      .then((res) => {
        if (cancelled) return;
        setKits(res.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setKits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!isPro) {
      toast({
        title: "Brand Kits are a Pro feature",
        description: "Upgrade to save a colour palette, logo, and font your videos auto-apply.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const res = await studioService.createBrandKit({
        name: draft.name.trim() || "My Brand",
        primaryColor: draft.primaryColor,
        secondaryColor: draft.secondaryColor,
        accentColor: draft.accentColor,
        fontFamily: draft.fontFamily.trim() || "Inter",
        logoUrl: draft.logoUrl.trim() || null,
      });
      if (res.data) {
        setKits((prev) => [res.data!, ...prev]);
        onChange(res.data.id);
        setEditing(false);
        setDraft(DEFAULT_DRAFT);
        toast({ title: "Brand kit saved" });
      }
    } catch (err) {
      toast({
        title: "Could not save brand kit",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(kit: StudioBrandKit) {
    try {
      await studioService.deleteBrandKit(kit.id);
      setKits((prev) => prev.filter((k) => k.id !== kit.id));
      if (value === kit.id) onChange(null);
    } catch (err) {
      toast({
        title: "Could not delete brand kit",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading brand kits…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* "None" option — restores raw template colours */}
      <label
        className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors ${
          value === null ? "border-primary bg-primary/5" : "hover:bg-muted/40"
        }`}
      >
        <input
          type="radio"
          name="studio-brand-kit"
          checked={value === null}
          onChange={() => onChange(null)}
          className="h-3 w-3"
        />
        <span className="flex-1">No brand kit</span>
        <span className="text-[10px] text-muted-foreground">Use template colours</span>
      </label>

      {kits.map((kit) => (
        <label
          key={kit.id}
          className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors ${
            value === kit.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
          }`}
        >
          <input
            type="radio"
            name="studio-brand-kit"
            checked={value === kit.id}
            onChange={() => onChange(kit.id)}
            className="h-3 w-3"
          />
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: kit.primaryColor }}
            />
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: kit.secondaryColor }}
            />
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: kit.accentColor }}
            />
          </span>
          <span className="flex-1 truncate font-medium">{kit.name}</span>
          {kit.isDefault && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
              Default
            </Badge>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            title="Delete brand kit"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDelete(kit);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </label>
      ))}

      {editing ? (
        <div className="rounded border bg-muted/20 p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Primary</Label>
              <Input
                type="color"
                value={draft.primaryColor}
                onChange={(e) => setDraft((d) => ({ ...d, primaryColor: e.target.value }))}
                className="h-7 p-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px]">Secondary</Label>
              <Input
                type="color"
                value={draft.secondaryColor}
                onChange={(e) => setDraft((d) => ({ ...d, secondaryColor: e.target.value }))}
                className="h-7 p-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px]">Accent</Label>
              <Input
                type="color"
                value={draft.accentColor}
                onChange={(e) => setDraft((d) => ({ ...d, accentColor: e.target.value }))}
                className="h-7 p-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px]">Font family</Label>
              <Input
                value={draft.fontFamily}
                onChange={(e) => setDraft((d) => ({ ...d, fontFamily: e.target.value }))}
                placeholder="Inter"
                className="h-7 text-xs"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px]">Logo URL (optional)</Label>
              <Input
                value={draft.logoUrl}
                onChange={(e) => setDraft((d) => ({ ...d, logoUrl: e.target.value }))}
                placeholder="https://…/logo.png"
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save kit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setEditing(false);
                setDraft(DEFAULT_DRAFT);
              }}
              disabled={creating}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs justify-start"
          onClick={() => setEditing(true)}
          disabled={!isPro}
          title={isPro ? "Create a new brand kit" : "Pro plan only — upgrade to save brand kits"}
        >
          <Plus className="h-3 w-3 mr-1.5" />
          {isPro ? "New brand kit" : "New brand kit (Pro)"}
        </Button>
      )}
    </div>
  );
}
