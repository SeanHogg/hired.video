/**
 * Admin Moderation Queue — two-tab shell.
 *
 *   • "Pending Review"  — pre-publish creator content (articles / FAQs / guides)
 *                         awaiting SuperAdmin approval. Multi-select bulk scan,
 *                         approve, reject.
 *   • "Home wall"       — public videos the explicit scan blocked or could not
 *                         check; approve / keep blocked (audit-logged).
 *   • "Abuse Reports"   — post-publish user-filed content_reports. Resolve flow
 *                         dispatches notifications + /inbox recap.
 *
 * Mounted at /admin/moderation. The route + page are gated by AdminLayout's
 * SuperAdmin guard.
 */
import { ShieldCheck } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import AbuseReportsPanel from "@/components/admin/moderation/AbuseReportsPanel";
import ContentReviewPanel from "@/components/admin/moderation/ContentReviewPanel";
import ResourceReviewPanel from "@/components/admin/moderation/ResourceReviewPanel";
import ExplicitScanReviewPanel from "@/components/admin/moderation/ExplicitScanReviewPanel";
import { useTranslation } from "react-i18next";

export default function ModerationQueue() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="h-5 w-5 text-pink-500" />
          Moderation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve creator submissions before they go public, and resolve
          post-publish abuse reports.
        </p>
      </header>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Pending Review</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="reports">Abuse Reports</TabsTrigger>
          <TabsTrigger value="home-wall">{t("moderation.admin.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="pt-4">
          <ContentReviewPanel />
        </TabsContent>
        <TabsContent value="resources" className="pt-4">
          <ResourceReviewPanel />
        </TabsContent>
        <TabsContent value="reports" className="pt-4">
          <AbuseReportsPanel />
        </TabsContent>
        <TabsContent value="home-wall" className="pt-4">
          <ExplicitScanReviewPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
