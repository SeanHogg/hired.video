import { useEffect, useState } from "react";
import {
  Loader2, Plus, Trash2, Star, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UpgradePrompt } from "@/components/ads/UpgradePrompt";
import PayoutProfileForm from "@/components/creator/PayoutProfileForm";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import {
  creatorService,
  type CreatorProfile,
} from "@/lib/services/creator-service";

interface PortfolioItem {
  id: string;
  title: string;
  description?: string | null;
  mediaType: "video" | "image";
  mediaUrl: string;
  thumbnailUrl?: string | null;
  isFeatured?: boolean | null;
  isPublic?: boolean | null;
}

interface Props {
  profile: CreatorProfile;
  onProfileChange: (next: CreatorProfile | null) => void;
}

export default function CreatorWorkspace({ profile, onProfileChange }: Props) {
  const { toast } = useToast();

  // Profile editor state. `categories` is derived server-side from the active
  // program flags (see shared/creator-programs.ts) — not user-editable here.
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [tagline, setTagline] = useState(profile.tagline ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Cancel-all state
  const [cancelling, setCancelling] = useState(false);

  // Portfolio state
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", description: "", mediaUrl: "", thumbnailUrl: "", mediaType: "video" as "video" | "image" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setDisplayName(profile.displayName ?? "");
    setTagline(profile.tagline ?? "");
    setBio(profile.bio ?? "");
  }, [profile.id]);

  useEffect(() => {
    let cancelled = false;
    setPortfolioLoading(true);
    apiClient.get<PortfolioItem[]>("/api/creators/portfolio")
      .then((res) => { if (!cancelled) setPortfolio(res.data ?? []); })
      .catch(() => { if (!cancelled) setPortfolio([]); })
      .finally(() => { if (!cancelled) setPortfolioLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await creatorService.updateProfile({ displayName, tagline, bio });
      onProfileChange(updated);
      toast({ title: "Saved", description: "Creator profile updated." });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const cancelEverything = async () => {
    if (!confirm("Leave the Creator Program entirely? Your enrollment will end. You can re-enroll later — this starts a new enrollment row.")) return;
    setCancelling(true);
    try {
      await creatorService.cancel();
      onProfileChange(null);
      toast({ title: "Left the program", description: "Your creator enrollment has ended." });
    } catch (e: unknown) {
      toast({ title: "Cancel failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const addPortfolioItem = async () => {
    if (!newItem.title.trim() || !newItem.mediaUrl.trim()) {
      toast({ title: "Missing fields", description: "Title and media URL are required", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await apiClient.post<PortfolioItem>("/api/creators/portfolio", {
        title: newItem.title,
        description: newItem.description || undefined,
        mediaType: newItem.mediaType,
        mediaUrl: newItem.mediaUrl,
        thumbnailUrl: newItem.thumbnailUrl || undefined,
        isPublic: true,
      });
      setPortfolio((cur) => [res.data, ...cur]);
      setNewItem({ title: "", description: "", mediaUrl: "", thumbnailUrl: "", mediaType: "video" });
      setShowAddItem(false);
      toast({ title: "Added", description: "Portfolio item published." });
    } catch (e: unknown) {
      toast({ title: "Add failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const deletePortfolioItem = async (id: string) => {
    const previous = portfolio;
    setPortfolio((cur) => cur.filter((i) => i.id !== id));
    try {
      await apiClient.delete(`/api/creators/portfolio/${id}`);
    } catch (e: unknown) {
      setPortfolio(previous);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const featurePortfolioItem = async (id: string) => {
    try {
      await apiClient.post(`/api/creators/portfolio/${id}/feature`, {});
      setPortfolio((cur) => cur.map((i) => ({ ...i, isFeatured: i.id === id })));
    } catch (e: unknown) {
      toast({ title: "Feature failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Self-gates: only renders when the user is on the free plan. */}
      <UpgradePrompt
        featureName="Your creator listings are hidden"
        benefit="Subscribe to Pro ($9.95/mo) to publish your services, voice clones, courses, and articles to the marketplace."
      />

      {/* Profile editor */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-semibold">Creator profile</h2>
          <p className="text-sm text-muted-foreground">These details surface on your public profile under the Services tab.</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cw-displayName">Display name</Label>
              <Input id="cw-displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cw-tagline">Tagline</Label>
              <Input id="cw-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="cw-bio">Bio</Label>
            <Textarea id="cw-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile} size="sm">
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payouts — same shared form rendered in Settings → Payouts. The
          component self-fetches and self-gates on creator status, so it
          shows the form here (creator confirmed) and a CTA to non-creators
          when embedded in Settings. */}
      <PayoutProfileForm />

      {/* Portfolio */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold">Portfolio</h2>
              <p className="text-sm text-muted-foreground">Showcase your best work. One item can be marked as featured.</p>
            </div>
            <Button size="sm" onClick={() => setShowAddItem((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" /> Add item
            </Button>
          </div>

          {showAddItem && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pf-title">Title</Label>
                  <Input id="pf-title" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pf-mediaType">Media type</Label>
                  <select
                    id="pf-mediaType"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={newItem.mediaType}
                    onChange={(e) => setNewItem({ ...newItem, mediaType: e.target.value as "video" | "image" })}
                  >
                    <option value="video">Video</option>
                    <option value="image">Image</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="pf-mediaUrl">Media URL</Label>
                <Input id="pf-mediaUrl" value={newItem.mediaUrl} onChange={(e) => setNewItem({ ...newItem, mediaUrl: e.target.value })} placeholder="https://…" />
              </div>
              <div>
                <Label htmlFor="pf-thumbnailUrl">Thumbnail URL (optional)</Label>
                <Input id="pf-thumbnailUrl" value={newItem.thumbnailUrl} onChange={(e) => setNewItem({ ...newItem, thumbnailUrl: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pf-description">Description</Label>
                <Textarea id="pf-description" rows={2} value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAddItem(false)}>Cancel</Button>
                <Button size="sm" onClick={addPortfolioItem} disabled={adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Publish
                </Button>
              </div>
            </div>
          )}

          {portfolioLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading portfolio…
            </div>
          ) : portfolio.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No portfolio items yet. Add one to showcase your work to buyers.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {portfolio.map((item) => (
                <div key={item.id} className="rounded-lg border overflow-hidden">
                  <div className="aspect-video bg-muted relative">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">{item.mediaType}</div>
                    )}
                    {item.isFeatured && (
                      <Badge className="absolute top-2 left-2 bg-amber-500 text-white">Featured</Badge>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="font-medium text-sm truncate">{item.title}</div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => featurePortfolioItem(item.id)} disabled={item.isFeatured === true}>
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deletePortfolioItem(item.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel everything */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">Leave the Creator Program</h2>
              <p className="text-sm text-muted-foreground">
                Ends your enrollment entirely. Active per-program flags are cleared and the enrollment is closed (term date set). You can re-enroll any time — this starts a new enrollment row, preserving your earnings history.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" onClick={cancelEverything} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Leave program
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
