// /articles — back-compat surface for external links and the Dashboard
// "Write article" button. The canonical surface is the Articles sub-tab
// under /services/creator/articles inside the Content Creator workspace;
// both render the same ArticlesManagerPanel.

import { useSEO } from "@/lib/seo";
import ArticlesManagerPanel from "@/components/creator/ArticlesManagerPanel";
import { AppShell } from "@/components/AppShell";

export default function ArticlesManager() {
  useSEO("/articles");
  return (
    <AppShell bgClassName="bg-background">
      <div className="pt-16">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <ArticlesManagerPanel />
        </div>
      </div>
    </AppShell>
  );
}
