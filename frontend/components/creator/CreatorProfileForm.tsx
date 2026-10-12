import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";

interface Props {
  onProfileChange?: (next: CreatorProfile) => void;
}

/**
 * Self-contained creator-profile editor — fetches its own data and self-gates
 * on creator enrollment. Mounted from both the /services Creator workspace
 * and /settings → Content Creator → Profile. Non-creators get an enrollment
 * CTA instead of an editable form, matching PayoutProfileForm's contract.
 */
export default function CreatorProfileForm({ onProfileChange }: Props = {}) {
  const { toast } = useToast();

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    creatorService.getMine()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) {
          setDisplayName(p.displayName ?? "");
          setTagline(p.tagline ?? "");
          setBio(p.bio ?? "");
        }
      })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await creatorService.updateProfile({ displayName, tagline, bio });
      setProfile(updated);
      onProfileChange?.(updated);
      toast({ title: "Saved", description: "Creator profile updated." });
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading creator profile…
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-3">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-semibold">Profile lives in the Creator Program</h3>
            <p className="text-sm text-muted-foreground">
              Your display name, tagline, and bio surface on your public marketplace listings — only collected once you've joined. Enroll and your profile settings will live here and on your creator workspace.
            </p>
            <Button asChild size="sm">
              <Link to="/services?wizard=open">Enroll in the Creator Program</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <h2 className="font-semibold">Creator profile</h2>
        <p className="text-sm text-muted-foreground">These details surface on your public profile under the Services tab.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
