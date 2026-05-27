/**
 * RelatedAudiences — chip strip at the bottom of /for/[audience] linking
 * sibling life-stage audiences. Reads directly from the registry so a new
 * audience auto-surfaces here without per-page wiring.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  LIFE_STAGE_AUDIENCE_REGISTRY,
  type LifeStageAudienceMeta,
} from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";

export interface RelatedAudiencesProps {
  /** Current audience key — used to omit self from the chip strip. */
  current: LifeStageAudienceMeta["key"];
}

export function RelatedAudiences({ current }: RelatedAudiencesProps): JSX.Element {
  const others = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) => a.key !== current);
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8 border-t">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="mb-4 text-2xl font-bold">Other paths</h2>
        <p className="mb-6 text-muted-foreground">Same platform, different starting point.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {others.map((a) => (
            <Link key={a.key} to={`/for/${audienceSlug(a.key)}`}>
              <Badge variant="outline" className="px-3 py-1 hover:bg-muted transition-colors cursor-pointer">
                {a.label}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
