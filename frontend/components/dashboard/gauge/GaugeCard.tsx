/**
 * GaugeCard — Card chrome around a <SpeedometerGauge>. Renders the dial
 * plus the current tier, the next tier to reach, the motivational hint
 * and a primary CTA. Consumers just hand it a normalized GaugeModel, so
 * every role's card looks and behaves identically.
 */

import { Link } from "react-router-dom";
import { Gauge as GaugeIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpeedometerGauge } from "./SpeedometerGauge";
import { currentLevel, nextLevel, type GaugeModel } from "@/lib/dashboard/gauge";

interface Props {
  model: GaugeModel;
  className?: string;
}

export function GaugeCard({ model, className }: Props) {
  const level = currentLevel(model.score, model.levels);
  const next = nextLevel(model.score, model.levels);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <GaugeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          {model.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SpeedometerGauge model={model} />

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Badge variant="secondary">{level.name}</Badge>
          {next && (
            <span className="text-xs text-muted-foreground">
              Next: {next.name} ({next.min})
            </span>
          )}
        </div>

        {model.hint && (
          <p className="text-sm text-center text-muted-foreground">{model.hint}</p>
        )}

        {model.action && (
          <div className="flex justify-center">
            <Button asChild size="sm">
              <Link to={model.action.href}>{model.action.label}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default GaugeCard;
