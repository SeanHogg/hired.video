// eslint-page-chrome: skip — admin page; chrome is provided by <AdminLayout>
// at the route (App.tsx), matching every other pages/admin/* surface.
//
// SuperAdmin management UI for page → video embeds (#1866). Lists every
// active page→video mapping (the placements published via the Studio
// "Embed" dialog) and lets an operator audit, jump to the source project,
// or unpublish a route. Reads `studioService.listPageEmbeds()`; the
// backend `GET /api/studio/page-embeds` is SuperAdmin-gated.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Trash2, ExternalLink, Film, MonitorPlay } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioService } from "@/lib/services/studio-service";
import { useToast } from "@/hooks/use-toast";

export default function PageEmbeds() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "page-embeds"],
    queryFn: () => studioService.listPageEmbeds(),
  });
  const embeds = data?.data?.embeds ?? [];

  const unpublish = useMutation({
    mutationFn: (pathname: string) => studioService.removePageEmbed(pathname),
    onSuccess: async (_res, pathname) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "page-embeds"] }),
        queryClient.invalidateQueries({ queryKey: ["page-embed-paths"] }),
        queryClient.invalidateQueries({ queryKey: ["page-embed", pathname] }),
      ]);
      toast({ title: "Unpublished", description: `${pathname} no longer shows a video.` });
    },
    onError: (e) =>
      toast({
        title: "Couldn't unpublish",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      }),
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <MonitorPlay className="h-5 w-5 text-brand-purple" />
        <h1 className="text-xl font-semibold">Page Videos</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Marketing pages currently showing a Studio video. Published from the
        Studio editor's <span className="font-medium">Embed</span> button.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active placements ({embeds.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : embeds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No pages have a video yet. Open the AI Brain on a page and ask it to
              build one, then publish it from Studio.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Page</th>
                    <th className="py-2 pr-4 font-medium">Video</th>
                    <th className="py-2 pr-4 font-medium">Placement</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {embeds.map((e) => (
                    <tr key={e.pathname} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <a
                          href={e.pathname}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-brand-blue hover:underline"
                        >
                          {e.pathname}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="py-2 pr-4">{e.title}</td>
                      <td className="py-2 pr-4 capitalize">{e.placement}</td>
                      <td className="py-2 pr-4">
                        {e.rendered ? (
                          <Badge variant="secondary">Rendered</Badge>
                        ) : (
                          <Badge variant="outline">Live canvas</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
                            <Link to={`/studio/${encodeURIComponent(e.projectId)}`}>
                              <Film className="h-4 w-4" />
                              Open
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-destructive hover:text-destructive"
                            disabled={unpublish.isPending}
                            onClick={() => unpublish.mutate(e.pathname)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Unpublish
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
