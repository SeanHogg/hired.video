import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Eye, 
  MoreHorizontal, 
  Edit, 
  Download, 
  Share2, 
  Trash2,
  Calendar,
  User,
  FileText,
  ChevronDown
} from "lucide-react";

interface ResumeCardProps {
  id: string;
  name: string;
  title?: string;
  summary: string;
  createdAt: string;
  views?: number;
  onView?: () => void;
  onEdit?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
}

export default function ResumeCard({
  name,
  title,
  summary,
  createdAt,
  views = 0,
  onView,
  onEdit,
  onDownload,
  onShare,
  onDelete,
}: ResumeCardProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handleCardClick = () => {
    onView?.();
  };

  return (
    <Card className="group cursor-pointer hover:shadow-lg transition-all duration-300 border hover:border-primary/30 overflow-hidden">
      <CardContent className="p-0">
        {/* Header with Name and Date */}
        <div className="p-4 border-b border-border bg-muted/30" onClick={handleCardClick}>
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">NAME</p>
                <h3 className="font-bold text-lg text-foreground leading-tight">{name}</h3>
                {title && (
                  <p className="text-sm text-muted-foreground mt-1">{title}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                Resume
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>CREATION</span>
              </div>
              <span className="font-medium text-foreground">{formatDate(createdAt)}</span>
            </div>
            
            {views > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="w-3 h-3" />
                <span>{views} views</span>
              </div>
            )}
          </div>
        </div>

        {/* Details Section */}
        <div className="p-4 bg-primary text-primary-foreground" onClick={handleCardClick}>
          <div className="space-y-3">
            <h4 className="font-bold text-lg">Details</h4>
            <div>
              <p className="text-xs font-medium opacity-80 uppercase tracking-wide mb-2">SUMMARY</p>
              <p className="text-sm leading-relaxed opacity-95">
                {summary}
              </p>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 flex items-center justify-between bg-background">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onView?.();
            }}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            View
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="default" size="sm" className="gap-2">
                Actions
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEdit?.()} className="gap-2">
                <Edit className="w-4 h-4" />
                Edit Resume
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload?.()} className="gap-2">
                <Download className="w-4 h-4" />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onShare?.()} className="gap-2">
                <Share2 className="w-4 h-4" />
                Share Resume
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete?.()} 
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Delete Resume
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
