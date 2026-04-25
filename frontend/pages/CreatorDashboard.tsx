// CreatorDashboard — /creators/dashboard
// Authenticated creator workspace. Three states:
//   1. Not authenticated → log in CTA
//   2. Authenticated, no creator profile → opt-in flow (paywall + terms gate)
//   3. Active creator → profile fields + portfolio CRUD + earnings summary
//
// Project workflow (revisions, escrow, disputes) is intentionally out of
// scope for this MVP — those endpoints exist on the API and can be wired
// into a future "Active Projects" surface.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles, Crown, Plus, Trash2, Edit2, Star, ExternalLink,
  CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { useSEO } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/hooks/use-sidebar";

type CreatorProfile = {
  userId: string;
  isActive: boolean;
  displayName?: string | null;
  tagline?: string | null;
  bio?: string | null;
  categories?: string[] | null;
  languages?: string[] | null;
  defaultPriceCents?: number | null;
  averageDeliveryDays?: number | null;
  averageRating?: number | null;
  completedProjectsCount?: number | null;
  totalEarnedCents?: number | null;
};

type PortfolioItem = {
  id: string;
  title: string;
  description?: string | null;
  mediaType: "video" | "image";
  mediaUrl: string;
  thumbnailUrl?: string | null;
  category?: string | null;
  tags?: string[] | null;
  isFeatured?: boolean | null;
  isPublic?: boolean | null;
};

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    ...opts,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error?.message ?? json?.message ?? `HTTP ${r.status}`);
  return (json?.data ?? json) as T;
}

export default function CreatorDashboard() {
  useSEO("/creators");
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile form state
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");
  const [defaultPrice, setDefaultPrice] = useState<string>("");

  // New portfolio item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", description: "", mediaUrl: "", thumbnailUrl: "", mediaType: "video" as "video" | "image" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<CreatorProfile | null>("/api/creators/me").catch(() => null),
      api<PortfolioItem[]>("/api/creators/portfolio").catch(() => [] as PortfolioItem[]),
    ])
      .then(([p, items]) => {
        if (cancelled) return;
        setProfile(p);
        setPortfolio(Array.isArray(items) ? items : []);
        if (p) {
          setDisplayName(p.displayName ?? "");
          setTagline(p.tagline ?? "");
          setBio(p.bio ?? "");
          setCategoriesInput((p.categories ?? []).join(", "));
          setDefaultPrice(p.defaultPriceCents != null ? String(p.defaultPriceCents / 100) : "");
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const isPaid = (user?.subscription && user.subscription !== "free") ?? false;

  const handleOptIn = async () => {
    setSaving(true);
    setError(null);
    try {
      // Accept current creator terms first.
      await api("/api/legal/accept", {
        method: "POST",
        body: JSON.stringify({ kind: "creator_terms" }),
      }).catch(() => undefined); // best-effort; opt-in returns a clear error if missing

      const created = await api<CreatorProfile>("/api/creators/opt-in", {
        method: "POST",
        body: JSON.stringify({ displayName: user?.name ?? null }),
      });
      setProfile(created);
      toast({ title: "Welcome aboard!", description: "Your creator profile is live. Start adding portfolio work." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Opt-in failed";
      setError(msg);
      toast({ title: "Couldn't opt in", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const categories = categoriesInput.split(",").map((s) => s.trim()).filter(Boolean);
      const priceCents = defaultPrice ? Math.round(parseFloat(defaultPrice) * 100) : null;
      const updated = await api<CreatorProfile>("/api/creators/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, tagline, bio, categories, defaultPriceCents: priceCents }),
      });
      setProfile(updated);
      toast({ title: "Saved", description: "Profile updated." });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.title.trim() || !newItem.mediaUrl.trim()) {
      toast({ title: "Missing fields", description: "Title and media URL are required", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const created = await api<PortfolioItem>("/api/creators/portfolio", {
        method: "POST",
        body: JSON.stringify({
          title: newItem.title,
          description: newItem.description || undefined,
          mediaType: newItem.mediaType,
          mediaUrl: newItem.mediaUrl,
          thumbnailUrl: newItem.thumbnailUrl || undefined,
          isPublic: true,
        }),
      });
      setPortfolio((cur) => [created, ...cur]);
      setNewItem({ title: "", description: "", mediaUrl: "", thumbnailUrl: "", mediaType: "video" });
      setShowAddItem(false);
      toast({ title: "Added", description: "Portfolio item published." });
    } catch (e: unknown) {
      toast({ title: "Add failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const previous = portfolio;
    setPortfolio((cur) => cur.filter((i) => i.id !== id));
    try {
      await api(`/api/creators/portfolio/${id}`, { method: "DELETE" });
    } catch (e: unknown) {
      setPortfolio(previous);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const handleFeatureItem = async (id: string) => {
    try {
      await api(`/api/creators/portfolio/${id}/feature`, { method: "POST" });
      setPortfolio((cur) => cur.map((i) => ({ ...i, isFeatured: i.id === id })));
    } catch (e: unknown) {
      toast({ title: "Feature failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-primary" /> Creator Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">Earn 95% on every promo video, intro, or job-pitch you deliver.</p>
              </div>
              {profile?.isActive && (
                <Button variant="outline" asChild>
                  <Link to={`/creators/${profile.userId}`}>
                    View public profile <ExternalLink className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              )}
            </div>

            {/* Not authenticated */}
            {!isAuthenticated && (
              <Card className="p-8 text-center">
                <p className="font-medium mb-2">Sign in to become a creator</p>
                <p className="text-sm text-muted-foreground mb-4">You'll need an account to opt in and accept payments.</p>
                <div className="flex items-center justify-center gap-2">
                  <Link to="/login"><Button variant="outline">Sign in</Button></Link>
                  <Link to="/signup"><Button>Sign up</Button></Link>
                </div>
              </Card>
            )}

            {/* Loading */}
            {isAuthenticated && loading && (
              <Card className="p-8 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading your creator profile…
              </Card>
            )}

            {/* Authenticated, not yet a creator → opt-in flow */}
            {isAuthenticated && !loading && !profile && (
              <Card className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <Crown className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-semibold">Become a Creator</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Take paid promo-video briefs from job seekers and recruiters. Set your own rates,
                      get paid through escrow, build a portfolio.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm mb-5">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>You keep <strong>95%</strong> of each sale (5% platform fee)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>3 included revisions per project, escrow auto-releases after 7 days</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>Built-in dispute resolution & customer reviews</span>
                  </div>
                </div>

                {!isPaid && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-sm mb-4">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Paid plan required</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Becoming a creator requires the $9.95/mo Creator subscription. <Link to="/pricing" className="underline">Upgrade</Link> first, then come back here.
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm mb-4">
                    {error}
                  </div>
                )}

                <Button onClick={handleOptIn} disabled={saving || !isPaid} className="w-full sm:w-auto">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opting in…</> : "Accept terms & opt in"}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">By opting in you agree to the <Link to="/terms" className="underline">Creator Terms</Link>.</p>
              </Card>
            )}

            {/* Active creator */}
            {isAuthenticated && profile?.isActive && (
              <>
                {/* Earnings strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <Card className="p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Earned</p>
                    <p className="text-xl font-bold">${((profile.totalEarnedCents ?? 0) / 100).toFixed(0)}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Projects</p>
                    <p className="text-xl font-bold">{profile.completedProjectsCount ?? 0}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Rating</p>
                    <p className="text-xl font-bold">
                      {profile.averageRating != null && profile.averageRating > 0 ? Number(profile.averageRating).toFixed(1) : "—"}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Portfolio</p>
                    <p className="text-xl font-bold">{portfolio.length}</p>
                  </Card>
                </div>

                {/* Profile editor */}
                <Card className="p-5 mb-6">
                  <h2 className="font-semibold mb-4">Profile</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="displayName">Display name</Label>
                      <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="defaultPrice">Starting price (USD)</Label>
                      <Input id="defaultPrice" type="number" min="0" step="1" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="tagline">Tagline</Label>
                      <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. 60-second job-pitch videos that actually get callbacks" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="categories">Categories (comma-separated)</Label>
                      <Input id="categories" value={categoriesInput} onChange={(e) => setCategoriesInput(e.target.value)} placeholder="job-pitch, recruiter-intro, day-in-life" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Tell potential clients about your style, experience, and what you make best." />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={saving}>
                      {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Save profile"}
                    </Button>
                  </div>
                </Card>

                {/* Portfolio */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Portfolio</h2>
                    <Button size="sm" onClick={() => setShowAddItem((s) => !s)}>
                      <Plus className="h-4 w-4 mr-1" /> Add item
                    </Button>
                  </div>

                  {showAddItem && (
                    <div className="rounded-md border bg-muted/30 p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label>Title *</Label>
                          <Input value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
                        </div>
                        <div>
                          <Label>Type</Label>
                          <select
                            value={newItem.mediaType}
                            onChange={(e) => setNewItem({ ...newItem, mediaType: e.target.value as "video" | "image" })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="video">Video</option>
                            <option value="image">Image</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Media URL *</Label>
                          <Input value={newItem.mediaUrl} onChange={(e) => setNewItem({ ...newItem, mediaUrl: e.target.value })} placeholder="https://…" />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Thumbnail URL (optional)</Label>
                          <Input value={newItem.thumbnailUrl} onChange={(e) => setNewItem({ ...newItem, thumbnailUrl: e.target.value })} placeholder="https://…" />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Description (optional)</Label>
                          <Textarea value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} rows={2} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowAddItem(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleAddItem} disabled={adding}>
                          {adding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding</> : "Publish"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {portfolio.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No portfolio items yet. Add your best work — featured items show first on your public profile.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {portfolio.map((item) => (
                        <Card key={item.id} className="overflow-hidden">
                          <div className="aspect-video bg-muted relative">
                            {item.thumbnailUrl ? (
                              <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                            ) : item.mediaType === "image" ? (
                              <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <video src={item.mediaUrl} className="w-full h-full object-cover" preload="metadata" />
                            )}
                            {item.isFeatured && <Badge className="absolute top-2 left-2 text-[10px]">Featured</Badge>}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <div className="flex items-center justify-end gap-1 mt-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Feature on public profile" onClick={() => handleFeatureItem(item.id)}>
                                <Star className={`h-3.5 w-3.5 ${item.isFeatured ? "fill-amber-400 text-amber-400" : ""}`} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Open" asChild>
                                <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete" onClick={() => handleDeleteItem(item.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}
