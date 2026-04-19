// Home page "AI Career Tools" highlight grid. Renders the subset of the
// central tool catalog flagged with `showOnHome` using the shared
// <ToolCard>, matching the /tools page exactly — same catalog, same
// card component, so the two surfaces can never drift.

import { ArrowRight, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { ToolCard } from "@/components/ToolCard";
import { getToolsForHome } from "@/data/tools-catalog";

export default function FeaturedTools() {
  const tools = getToolsForHome();
  if (tools.length === 0) return null;

  return (
    <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">
              AI Career Tools
            </h2>
          </div>
          <Link
            to="/tools"
            className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 group"
          >
            View all tools
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </div>
    </section>
  );
}
