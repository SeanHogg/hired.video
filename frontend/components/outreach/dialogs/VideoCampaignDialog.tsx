import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { StudioProject } from "@/lib/services/studio-service";
import type { VideoCampaignFormState } from "@/components/outreach/hooks/useVideoCampaignForm";

export function VideoCampaignDialog({
  state,
  publishedProjects,
}: {
  state: VideoCampaignFormState;
  publishedProjects: StudioProject[];
}) {
  const { t } = useTranslation();
  const { campaignForm, setCampaignForm, campaignVideoSelect, campaignSubmitting } = state;
  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("actions.createVideoCampaign")}</DialogTitle>
          <DialogDescription>
            {t("messages.groupVideosCampaign")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="campaign-name">{t("fields.campaignName.label")}</Label>
            <Input id="campaign-name" placeholder={t("fields.campaignName.placeholder")} value={campaignForm.name} onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="campaign-desc">{t("fields.taskDescription.label")}</Label>
            <Textarea id="campaign-desc" placeholder={t("fields.campaignDesc.placeholder")} value={campaignForm.description} onChange={(e) => setCampaignForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="utm-source" className="text-xs">{t("fields.utmSource.label")}</Label>
              <Input id="utm-source" placeholder={t("fields.utmSource.placeholder")} className="h-8 text-xs" value={campaignForm.utmSource} onChange={(e) => setCampaignForm((f) => ({ ...f, utmSource: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="utm-medium" className="text-xs">{t("fields.utmMedium.label")}</Label>
              <Input id="utm-medium" placeholder={t("fields.utmMedium.placeholder")} className="h-8 text-xs" value={campaignForm.utmMedium} onChange={(e) => setCampaignForm((f) => ({ ...f, utmMedium: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="utm-campaign" className="text-xs">{t("fields.utmCampaign.label")}</Label>
              <Input id="utm-campaign" placeholder={t("fields.utmCampaign.placeholder")} className="h-8 text-xs" value={campaignForm.utmCampaign} onChange={(e) => setCampaignForm((f) => ({ ...f, utmCampaign: e.target.value }))} />
            </div>
          </div>
          {/* Select videos to include */}
          {publishedProjects.length > 0 && (
            <div>
              <Label className="text-xs mb-1.5 block">{t("fields.includeVideos.label")}</Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                {publishedProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={campaignVideoSelect.includes(p.id)}
                      onChange={(e) => state.toggleVideo(p.id, e.target.checked)}
                      className="rounded"
                    />
                    <span className="truncate">{p.title}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{p.status}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => state.setOpen(false)}>{t("actions.cancel")}</Button>
          <Button
            disabled={!campaignForm.name.trim() || campaignSubmitting}
            onClick={state.submit}
          >
            {campaignSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {t("actions.createCampaign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
