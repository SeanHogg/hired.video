// JobTemplateCard — preview + cart-add card for a single JobTemplateDescriptor.
// Mirrors TemplateCard for resumes: a scaled-down DeclarativeJobRenderer
// preview over SAMPLE_JOB, hover-reveal "Preview" badge, price pill, and
// Preview / Add-to-Cart / Unlocked states wired into the existing cart +
// template-unlocks surfaces.

import { Check, Eye, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DeclarativeJobRenderer from "@/components/job-renderer/DeclarativeJobRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { SAMPLE_JOB } from "@/lib/sample-job";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import type { JobTemplateDescriptor } from "@/types/job-template";

interface JobTemplateCardProps {
  descriptor: JobTemplateDescriptor;
}

export default function JobTemplateCard({ descriptor }: JobTemplateCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addItem, openCart } = useCart();
  const isFree = !descriptor.priceCents || descriptor.priceCents <= 0;

  const priceLabel = (cents?: number): string => {
    if (!cents || cents <= 0) return t("labels.free");
    return `$${(cents / 100).toFixed(2)}`;
  };

  const [unlocked, setUnlocked] = useState(() => isTemplateUnlocked(descriptor.id));
  useEffect(() => {
    const handler = () => setUnlocked(isTemplateUnlocked(descriptor.id));
    window.addEventListener("hired:template-unlocked", handler);
    return () => window.removeEventListener("hired:template-unlocked", handler);
  }, [descriptor.id]);

  const openPreview = () => navigate(`/jobs/sample?template=${descriptor.id}`);

  const handlePrimary = () => {
    addItem({
      id: `job-template:${descriptor.id}`,
      name: descriptor.name,
      price: (descriptor.priceCents ?? 0) / 100,
      type: "template",
    });
    openCart();
  };

  return (
    <div className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
      <button
        type="button"
        onClick={openPreview}
        aria-label={t("labels.previewTemplateAria", { name: descriptor.name })}
        className="relative w-full h-72 overflow-hidden bg-muted/30 border-b block"
      >
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none">
          <div
            className="origin-top"
            style={{
              transform: "scale(0.32)",
              transformOrigin: "top center",
              width: "900px",
            }}
          >
            <DeclarativeJobRenderer job={SAMPLE_JOB} descriptor={descriptor} embedded />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
          <Badge variant="secondary" className="shadow">
            <Eye className="w-3 h-3 mr-1" />
            {t("actions.preview")}
          </Badge>
        </div>
      </button>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight">{descriptor.name}</h3>
            {descriptor.industry && (
              <p className="text-xs text-muted-foreground mt-0.5">{descriptor.industry}</p>
            )}
          </div>
          <Badge variant={isFree ? "secondary" : "default"} className="shrink-0">
            {priceLabel(descriptor.priceCents)}
          </Badge>
        </div>

        {descriptor.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{descriptor.description}</p>
        )}

        <div className="flex gap-2 mt-auto">
          <Button variant="outline" size="sm" className="flex-1" onClick={openPreview}>
            <Eye className="w-4 h-4 mr-1" />
            {t("actions.preview")}
          </Button>
          {unlocked ? (
            <Button size="sm" className="flex-1" variant="secondary" disabled>
              <Check className="w-4 h-4 mr-1" />
              {t("labels.unlocked")}
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={handlePrimary}>
              <ShoppingCart className="w-4 h-4 mr-1" />
              {t("actions.addToCart")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
