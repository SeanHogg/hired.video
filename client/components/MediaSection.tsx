import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetaBadge } from "@/components/MetaBadge";
import { ContentSection } from "@/components/ui/ContentSection";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeSectionMeta } from "@/types/resume";
import { MetaType } from "@/types/resume";
import { 
  PlayCircle, 
  Image as ImageIcon, 
  ExternalLink, 
  Eye,
  ArrowRight,
  Sparkles
} from "lucide-react";

interface MediaSectionProps {
  limit?: number;
  showTitle?: boolean;
  className?: string;
}

export function MediaSection({ 
  limit = 12, 
  showTitle = true, 
  className = "" 
}: MediaSectionProps) {
  const [metadata, setMetadata] = useState<ResumeSectionMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetadata();
  }, [limit]);

  const loadMetadata = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await resumeService.getPublicResumeMetadata(limit);
      setMetadata(data);
    } catch (err) {
      console.error("Failed to load resume metadata:", err);
      setError("Failed to load media content");
    } finally {
      setIsLoading(false);
    }
  };

  const getMetaIcon = (metaType: MetaType) => {
    switch (metaType) {
      case MetaType.YouTube:
      case MetaType.VideoMP4:
      case MetaType.VideoWebM:
        return <PlayCircle className="h-4 w-4" />;
      case MetaType.Image:
        return <ImageIcon className="h-4 w-4" />;
      case MetaType.Hyperlink:
      default:
        return <ExternalLink className="h-4 w-4" />;
    }
  };

  const getMetaTypeLabel = (metaType: MetaType) => {
    switch (metaType) {
      case MetaType.YouTube:
        return "YouTube";
      case MetaType.VideoMP4:
      case MetaType.VideoWebM:
        return "Video";
      case MetaType.Image:
        return "Image";
      case MetaType.Hyperlink:
        return "Link";
      case MetaType.HtmlContent:
        return "Content";
      default:
        return "Media";
    }
  };

  const renderMetadataCard = (meta: ResumeSectionMeta, index: number) => (
    <Card key={meta.id} className="hover:shadow-lg transition-shadow group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {getMetaIcon(meta.metaType)}
            <Badge variant="secondary" className="text-xs">
              {getMetaTypeLabel(meta.metaType)}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => window.open(meta.url, '_blank', 'noopener,noreferrer')}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-2">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {meta.name}
          </h3>
          
          {meta.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {meta.description}
            </p>
          )}
          
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {meta.creationDateTime && 
                new Date(meta.creationDateTime).toLocaleDateString()
              }
            </span>
            <MetaBadge meta={meta} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!showTitle && metadata.length === 0 && !isLoading) {
    return null; // Don't render anything if no content and title is hidden
  }

  return (
    <div className={className}>
      {showTitle && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold">Featured Videos & Images</h2>
          </div>
          {metadata.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <ContentSection
        title=""
        items={metadata}
        renderItem={renderMetadataCard}
        isLoading={isLoading}
        error={error}
        gridCols="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        maxItems={limit}
        emptyMessage="No videos or images available from public resumes"
        onRetry={loadMetadata}
        loadingSkeletonCount={8}
      />
    </div>
  );
}

export default MediaSection;
