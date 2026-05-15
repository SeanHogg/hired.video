/**
 * PublishAsTemplateDialog — turns the current Studio project into a
 * marketplace listing other creators can purchase.
 *
 * Two-stage UX:
 *   1. Creator gate. If the user isn't enrolled in the Video creator
 *      program, we show a "Become a creator — earn 95%" pitch instead of
 *      the publish form, with a deep link into /services?wizard=open
 *      (the existing CreatorEnrollmentWizard route).
 *   2. Publish form. Creator-only. Captures name / description / price /
 *      visibility + consent for the marketplace terms. Saves via
 *      `studioTemplatesService.publish`.
 *
 * Pricing copy mirrors the voice marketplace: a 95/5 split between creator
 * and platform. The actual fee is snapshotted server-side at publish time.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, Store, ShoppingBag, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  creatorService,
  type CreatorProfile,
} from "@/lib/services/creator-service";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Source project id — must be saved before the user can publish. */
  projectId: string | null;
  /** Pre-fill the listing name with the project name. */
  defaultName?: string;
  /** Optional thumbnail to attach (e.g. last rendered frame). */
  defaultThumbnailUrl?: string | null;
  /** Optional inline VideoScript getter. V2 callers pass
   *  `() => canvasStateToScript(state)` so the V2 project row doesn't
   *  have to duplicate the v1 storyboard on every save (gap #637).
   *  V1 callers omit this and the backend reads `project.storyboard`. */
  getVideoScript?: () => unknown;
  onPublished?: (template: StudioTemplate) => void;
}

const CREATOR_SHARE_PCT = 95;
const FREE_THRESHOLD_DOLLARS = 0;
const PRICE_MIN_DOLLARS = 0;
const PRICE_MAX_DOLLARS = 1000;

export default function PublishAsTemplateDialog({
  open,
  onOpenChange,
  projectId,
  defaultName,
  defaultThumbnailUrl,
  getVideoScript,
  onPublished,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [creatorState, setCreatorState] = useState<
    | { status: "loading" }
    | { status: "ready"; profile: CreatorProfile | null }
  >({ status: "loading" });

  const [name, setName] = useState(defaultName ?? "");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState<string>("0");
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("public");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset + refresh creator status whenever the dialog re-opens so we react
  // to the user enrolling in another tab.
  useEffect(() => {
    if (!open) return;
    setName(defaultName ?? "");
    setDescription("");
    setPriceDollars("0");
    setVisibility("public");
    setConsentAccepted(false);
    setCreatorState({ status: "loading" });

    let cancelled = false;
    void creatorService
      .getMine()
      .then((profile) => {
        if (cancelled) return;
        setCreatorState({ status: "ready", profile });
      })
      .catch(() => {
        if (cancelled) return;
        setCreatorState({ status: "ready", profile: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, defaultName]);

  const isVideoCreator =
    creatorState.status === "ready" && creatorState.profile?.videoActive === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      toast({
        title: "Save the project first",
        description:
          "Marketplace templates are forked from a saved project — save your work, then publish.",
        variant: "destructive",
      });
      return;
    }
    const dollars = Number(priceDollars);
    if (Number.isNaN(dollars) || dollars < PRICE_MIN_DOLLARS || dollars > PRICE_MAX_DOLLARS) {
      toast({
        title: "Invalid price",
        description: `Price must be between $${PRICE_MIN_DOLLARS} and $${PRICE_MAX_DOLLARS}.`,
        variant: "destructive",
      });
      return;
    }
    if (visibility === "public" && !consentAccepted) {
      toast({
        title: "Accept the marketplace terms",
        description: "Tick the consent box to publish publicly.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const priceCents = Math.round(dollars * 100);
      const template = await studioTemplatesService.publish({
        sourceProjectId: projectId,
        name: name.trim(),
        description: description.trim() || null,
        thumbnailUrl: defaultThumbnailUrl ?? null,
        priceCents,
        visibility,
        consentAccepted: visibility === "public" ? consentAccepted : undefined,
        // V2 callers compute the script at click time so we don't have
        // to mirror it on the project row — see #637 + ProjectChromeMenu.
        ...(getVideoScript ? { videoScript: getVideoScript() } : {}),
      });
      toast({
        title: "Template published",
        description:
          visibility === "public"
            ? "Your template is now in the marketplace."
            : "Saved as a private draft. Publish it whenever you're ready.",
      });
      onPublished?.(template);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to publish template.";
      toast({ title: "Publish failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            Publish to Template Marketplace
          </DialogTitle>
          <DialogDescription>
            List this project as a reusable template at{" "}
            <span className="font-medium">/search?category=templates</span>. Other
            creators can purchase a license — you keep {CREATOR_SHARE_PCT}% of
            every sale.
          </DialogDescription>
        </DialogHeader>

        {creatorState.status === "loading" && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Checking your creator status…
          </div>
        )}

        {creatorState.status === "ready" && !isVideoCreator && (
          <BecomeCreatorPitch
            onEnroll={() => {
              onOpenChange(false);
              navigate("/services?wizard=open");
            }}
          />
        )}

        {creatorState.status === "ready" && isVideoCreator && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cinematic Engineer Pitch"
                maxLength={200}
                required
              />
            </div>

            <div>
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What kind of project is this template best for?"
                maxLength={4000}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tpl-price">Price (USD)</Label>
                <Input
                  id="tpl-price"
                  type="number"
                  inputMode="decimal"
                  min={PRICE_MIN_DOLLARS}
                  max={PRICE_MAX_DOLLARS}
                  step="0.01"
                  value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {Number(priceDollars) <= FREE_THRESHOLD_DOLLARS
                    ? "Free template — buyers still claim a license."
                    : `You earn $${(Number(priceDollars) * (CREATOR_SHARE_PCT / 100)).toFixed(2)} per sale.`}
                </p>
              </div>
              <div>
                <Label htmlFor="tpl-vis">Visibility</Label>
                <select
                  id="tpl-vis"
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as "private" | "unlisted" | "public")
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="private">Private draft</option>
                  <option value="unlisted">Unlisted (link only)</option>
                  <option value="public">Public — list in marketplace</option>
                </select>
              </div>
            </div>

            {visibility === "public" && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-md border bg-muted/30">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                />
                <span>
                  I confirm this template is my own work or I have rights to
                  license it, and I accept the studio template marketplace
                  creator terms.
                </span>
              </label>
            )}

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Publishing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {visibility === "public" ? "Publish to Marketplace" : "Save Draft"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BecomeCreatorPitch({ onEnroll }: { onEnroll: () => void }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="rounded-lg border bg-gradient-to-br from-brand-purple/10 to-brand-blue/10 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <ShoppingBag className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">
              Become a creator to publish templates.
            </p>
            <p className="text-muted-foreground">
              Selling templates is a Creator Program perk. Set your own price,
              keep <span className="font-medium text-foreground">95%</span> of
              every sale, and reach buyers browsing the marketplace at{" "}
              <span className="font-medium">/search?category=templates</span>.
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              <li>One short enrollment wizard — takes about a minute.</li>
              <li>Accept the program terms once; toggle programs anytime.</li>
              <li>Templates remain editable and unpublishable from this dialog.</li>
            </ul>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onEnroll}>
          Become a creator
          <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </DialogFooter>
    </div>
  );
}
