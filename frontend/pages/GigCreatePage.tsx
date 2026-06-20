// GigCreatePage — post a brief to the gig marketplace. Any user can post a set
// of deliverable items (each with its own escrow amount); creators bid, the
// poster awards one, and the items become the winner's task board.

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Loader2, Briefcase } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/lib/seo";
import { gigService, type GigItemInput } from "@/lib/services/gig-service";

interface ItemDraft {
  title: string;
  description: string;
  amount: string; // dollars, as typed
}

const blankItem = (): ItemDraft => ({ title: "", description: "", amount: "" });

export default function GigCreatePage() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname, {
    title: t("gigs.create.seoTitle"),
    description: t("gigs.create.seoDescription"),
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [budgetKind, setBudgetKind] = useState<"fixed" | "hourly">("fixed");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([blankItem()]);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((cur) => [...cur, blankItem()]);
  const removeItem = (i: number) => setItems((cur) => cur.filter((_, idx) => idx !== i));

  const dollarsToCents = (v: string) => Math.round(Number.parseFloat(v || "0") * 100);

  const submit = async () => {
    if (title.trim().length < 3) {
      toast({ title: t("gigs.create.errTitle"), description: t("gigs.create.errTitleBody"), variant: "destructive" });
      return;
    }
    if (description.trim().length < 10) {
      toast({ title: t("gigs.create.errDesc"), description: t("gigs.create.errDescBody"), variant: "destructive" });
      return;
    }
    const min = dollarsToCents(budgetMin);
    const max = dollarsToCents(budgetMax);
    if (!(max >= min) || max <= 0) {
      toast({ title: t("gigs.create.errBudget"), description: t("gigs.create.errBudgetBody"), variant: "destructive" });
      return;
    }
    const cleanItems: GigItemInput[] = items
      .filter((it) => it.title.trim())
      .map((it) => ({ title: it.title.trim(), description: it.description.trim() || undefined, amountCents: dollarsToCents(it.amount) }));

    setSubmitting(true);
    try {
      const { project } = await gigService.create({
        title: title.trim(),
        description: description.trim(),
        requiredSkills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        budgetKind,
        budgetMinCents: min,
        budgetMaxCents: max,
        estimatedDurationDays: durationDays ? Number.parseInt(durationDays, 10) : undefined,
        items: cleanItems,
      });
      toast({ title: t("gigs.create.postedTitle"), description: t("gigs.create.postedBody") });
      navigate(`/services/gigs/${project.id}`);
    } catch (e) {
      toast({
        title: t("gigs.create.errPost"),
        description: e instanceof Error ? e.message : t("gigs.common.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-primary" />
            {t("gigs.create.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("gigs.create.intro")}</p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label htmlFor="gig-title">{t("gigs.create.fieldTitle")}</Label>
              <Input id="gig-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("gigs.create.titlePlaceholder")} />
            </div>
            <div>
              <Label htmlFor="gig-desc">{t("gigs.create.fieldDescription")}</Label>
              <Textarea id="gig-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("gigs.create.descPlaceholder")} />
            </div>
            <div>
              <Label htmlFor="gig-skills">{t("gigs.create.fieldSkills")}</Label>
              <Input id="gig-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder={t("gigs.create.skillsPlaceholder")} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="gig-kind">{t("gigs.create.budgetType")}</Label>
                <select
                  id="gig-kind"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={budgetKind}
                  onChange={(e) => setBudgetKind(e.target.value as "fixed" | "hourly")}
                >
                  <option value="fixed">{t("gigs.create.fixed")}</option>
                  <option value="hourly">{t("gigs.create.hourly")}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="gig-min">{t("gigs.create.budgetMin")}</Label>
                <Input id="gig-min" type="number" min="0" step="0.01" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="gig-max">{t("gigs.create.budgetMax")}</Label>
                <Input id="gig-max" type="number" min="0" step="0.01" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="gig-duration">{t("gigs.create.duration")}</Label>
                <Input id="gig-duration" type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{t("gigs.create.itemsTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("gigs.create.itemsIntro")}</p>
              </div>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> {t("gigs.create.addItem")}
              </Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex gap-2">
                  <Input
                    value={it.title}
                    onChange={(e) => updateItem(i, { title: e.target.value })}
                    placeholder={t("gigs.create.itemTitlePlaceholder", { n: i + 1 })}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-32"
                    value={it.amount}
                    onChange={(e) => updateItem(i, { amount: e.target.value })}
                    placeholder="$"
                  />
                  {items.length > 1 && (
                    <Button size="icon" variant="ghost" onClick={() => removeItem(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <Textarea
                  rows={2}
                  value={it.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  placeholder={t("gigs.create.itemDetailsPlaceholder")}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate("/services/gigs")} disabled={submitting}>
            {t("gigs.common.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t("gigs.create.submit")}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
