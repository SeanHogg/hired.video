/**
 * ToolShowcase — interactive tabs showing the 3-5 features that matter
 * most for an audience. Reads from the audience registry's
 * `focusFeatures` array — no per-page tab definitions.
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { AudienceFocusFeature } from "@shared/audiences-registry";

export interface ToolShowcaseProps {
  features: AudienceFocusFeature[];
  /** Optional eyebrow text rendered above the section header. */
  eyebrow?: string;
}

/** Renders the focus features grid. Self-gates: returns null when the
 *  caller has zero features to surface. */
export function ToolShowcase({ features, eyebrow }: ToolShowcaseProps): JSX.Element | null {
  if (features.length === 0) return null;
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          {eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-purple">{eyebrow}</p> : null}
          <h2 className="text-3xl font-bold">Tools made for this moment</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.key} className="h-full">
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <h3 className="text-xl font-semibold">{f.label}</h3>
                <p className="flex-1 text-muted-foreground">{f.blurb}</p>
                <Button asChild variant="ghost" className="self-start">
                  <Link to={f.href}>
                    Try it
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
