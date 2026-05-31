/**
 * SubmitResourceDialog — lets a signed-in user contribute a local resource
 * (government agency, job board, unemployment office, training, legal aid…)
 * for the location they're viewing. Submissions land `pending` and earn
 * points + the Local Guide badge once approved by a SuperAdmin.
 *
 * The location (country/state/city slugs) is passed in by the host so the
 * dialog is reusable on any /in/* page. A resource needs a link, a phone
 * number, or both — enforced here and again on the server.
 */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  RESOURCE_AUDIENCES,
  RESOURCE_AUDIENCE_LABEL,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABEL,
  resourceHasContact,
  type ResourceAudience,
  type ResourceCategory,
} from "@shared/community-resources";
import { communityResourcesService } from "@/lib/services/community-resources-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Geo context for the location page hosting the dialog. */
  countryCode: string;
  stateCode?: string | null;
  citySlug?: string | null;
  /** Human label for the location, e.g. "Texas" — shown in the header. */
  locationLabel: string;
  onSubmitted?: () => void;
}

export default function SubmitResourceDialog({
  open,
  onOpenChange,
  countryCode,
  stateCode,
  citySlug,
  locationLabel,
  onSubmitted,
}: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<ResourceCategory>("government_agency");
  const [audience, setAudience] = useState<ResourceAudience>("job_seeker");
  const [submitting, setSubmitting] = useState(false);

  const hasContact = resourceHasContact({ url, phone });
  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10 && hasContact;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await communityResourcesService.submit({
        title: title.trim(),
        description: description.trim(),
        url: url.trim() || undefined,
        phone: phone.trim() || undefined,
        category,
        audience,
        countryCode,
        stateCode: stateCode ?? null,
        citySlug: citySlug ?? null,
      });
      toast({
        title: "Thanks — resource submitted!",
        description: "It earns points now and goes live once a moderator approves it.",
      });
      setTitle("");
      setDescription("");
      setUrl("");
      setPhone("");
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      toast({
        title: "Couldn't submit",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggest a resource for {locationLabel}</DialogTitle>
          <DialogDescription>
            Know a helpful agency, job board, or service? Share it. Approved resources earn you
            points and the Local Guide badge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="res-title">Title</Label>
            <Input
              id="res-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Texas Workforce Commission — Unemployment Benefits"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="res-desc">What is it / who is it for?</Label>
            <Textarea
              id="res-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="A sentence or two on what this resource offers and who should use it."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="res-category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ResourceCategory)}>
                <SelectTrigger id="res-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{RESOURCE_CATEGORY_LABEL[cat]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="res-audience">Who's it for?</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as ResourceAudience)}>
                <SelectTrigger id="res-audience"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_AUDIENCES.map((aud) => (
                    <SelectItem key={aud} value={aud}>{RESOURCE_AUDIENCE_LABEL[aud]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="res-url">Website link</Label>
            <Input
              id="res-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-phone">Phone number</Label>
            <Input
              id="res-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 800-939-6631"
            />
          </div>
          {!hasContact && (title || description) && (
            <p className="text-xs text-amber-600">Add a website link, a phone number, or both.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit resource
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
