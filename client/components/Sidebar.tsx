import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Video,
  Upload,
  User,
  Briefcase,
  Search,
  TrendingUp,
  Calendar,
  Settings,
  HelpCircle,
  Star,
  Clock,
  Eye,
  FileText,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
}

export default function Sidebar({ isOpen, onClose, collapsed = false }: SidebarProps) {
  const [dragActive, setDragActive] = useState(false);

  const navigation = [
    { name: "Home", href: "/", icon: Home, current: true },
    { name: "Browse Videos", href: "/browse", icon: Video, current: false },
    { name: "Trending", href: "/trending", icon: TrendingUp, current: false },
    { name: "Search", href: "/search", icon: Search, current: false },
  ];

  const library = [
    { name: "My Videos", href: "/my-videos", icon: User, count: 3 },
    { name: "Watch Later", href: "/watch-later", icon: Clock, count: 12 },
    { name: "Favorites", href: "/favorites", icon: Star, count: 8 },
    { name: "Recently Viewed", href: "/recent", icon: Eye, count: 24 },
  ];

  const categories = [
    { name: "Software Engineering", count: 156 },
    { name: "Product Management", count: 89 },
    { name: "UX/UI Design", count: 134 },
    { name: "Data Science", count: 78 },
    { name: "Marketing", count: 92 },
    { name: "Sales", count: 67 },
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (file && (file.type === "application/pdf" || file.type.includes("word"))) {
      console.log("Resume uploaded:", file.name);
      // Here you would handle the file upload
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full bg-background border-r border-border z-50 transform transition-all duration-300 ease-in-out overflow-y-auto",
          collapsed ? "w-16" : "w-80",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:fixed lg:z-auto"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Link to="/" className="flex items-center space-x-2">
              <Video className="h-6 w-6 text-primary" />
              {!collapsed && (
                <span className="font-bold text-lg bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  MyVideoResume
                </span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Resume Upload Section */}
            <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5" />
                  Upload Resume
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                    dragActive
                      ? "border-primary bg-primary/10"
                      : "border-muted-foreground/30 hover:border-primary/50"
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium mb-1">
                    Drop your resume here
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    PDF, DOC, or DOCX files
                  </p>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Browse Files
                  </Button>
                </div>
                <Button className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                  Generate AI Video
                </Button>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Navigate
              </h3>
              <nav className="space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      item.current
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    onClick={onClose}
                  >
                    <item.icon className="mr-3 h-4 w-4" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>

            <Separator />

            {/* Library */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Your Library
              </h3>
              <nav className="space-y-1">
                {library.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    onClick={onClose}
                  >
                    <div className="flex items-center">
                      <item.icon className="mr-3 h-4 w-4" />
                      {item.name}
                    </div>
                    {item.count && (
                      <Badge variant="secondary" className="text-xs">
                        {item.count}
                      </Badge>
                    )}
                  </Link>
                ))}
              </nav>
            </div>

            <Separator />

            {/* Categories */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Categories
              </h3>
              <div className="space-y-2">
                {categories.map((category) => (
                  <Link
                    key={category.name}
                    to={`/category/${category.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    onClick={onClose}
                  >
                    <span>{category.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {category.count}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>

            <Separator />

            {/* Quick Actions */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-2"
                  onClick={onClose}
                >
                  <Briefcase className="h-4 w-4" />
                  Post Job Description
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-2"
                  onClick={onClose}
                >
                  <Calendar className="h-4 w-4" />
                  Schedule Interview
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border p-4 space-y-2">
            <Link
              to="/settings"
              className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors"
              onClick={onClose}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Link
              to="/help"
              className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors"
              onClick={onClose}
            >
              <HelpCircle className="h-4 w-4" />
              Help & Support
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
