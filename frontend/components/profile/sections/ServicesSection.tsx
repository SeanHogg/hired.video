import { Briefcase, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import AddFirstServiceCTA from "@/components/services/AddFirstServiceCTA";
import type { ServiceOffering } from "@/lib/services/services-service";

interface ServicesSectionProps {
  services: ServiceOffering[];
  isOwner: boolean;
  providerFirstName?: string;
  onAddToCart?: (service: ServiceOffering) => void;
  onRequestQuote?: (serviceId: string) => void;
}

export default function ServicesSection({
  services,
  isOwner,
  providerFirstName,
  onAddToCart,
  onRequestQuote,
}: ServicesSectionProps) {
  const { t } = useTranslation();
  if (services.length === 0) {
    return isOwner ? <AddFirstServiceCTA href="/services/offerings" /> : null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-violet-600" />
          {t("headings.services")}
        </CardTitle>
        <CardDescription>
          {t("labels.servicesByProvider", {
            provider: providerFirstName ?? t("labels.thisUser"),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.map((svc) => (
          <ServiceRow
            key={svc.id}
            service={svc}
            isOwner={isOwner}
            onAddToCart={onAddToCart}
            onRequestQuote={onRequestQuote}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface ServiceRowProps {
  service: ServiceOffering;
  isOwner: boolean;
  onAddToCart?: (service: ServiceOffering) => void;
  onRequestQuote?: (serviceId: string) => void;
}

function ServiceRow({ service, isOwner, onAddToCart, onRequestQuote }: ServiceRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{service.title}</span>
          {service.category && (
            <Badge variant="secondary" className="text-xs">
              {service.category}
            </Badge>
          )}
        </div>
        {service.description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {service.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-sm">
          {service.priceCents !== null ? (
            <span className="font-semibold text-violet-600">
              ${(service.priceCents / 100).toFixed(2)}
            </span>
          ) : (
            <span className="text-muted-foreground italic">
              {t("labels.contactForPricing")}
            </span>
          )}
          {service.deliveryDays && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("labels.deliveryDays", { days: service.deliveryDays })}
            </span>
          )}
        </div>
      </div>
      {!isOwner && (
        <div className="shrink-0">
          {service.priceCents !== null ? (
            <Button size="sm" onClick={() => onAddToCart?.(service)}>
              {t("actions.addToCart")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRequestQuote?.(service.id)}
            >
              {t("actions.requestQuote")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
