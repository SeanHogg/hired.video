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
  Building2,
  Users,
  Wrench,
  CheckSquare,
  Send,
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
    { name: "Dashboard", href: "/dashboard", icon: TrendingUp, current: false },
    { name: "Resumes", href: "/resumes", icon: FileText, current: false },
    { name: "Jobs", href: "/jobs", icon: Briefcase, current: false },
    { name: "Companies", href: "/companies", icon: Building2, current: false },
    { name: "People", href: "/people", icon: Users, current: false },
    { name: "Tools", href: "/tools", icon: Wrench, current: false },
    { name: "Tasks", href: "/tasks", icon: CheckSquare, current: false },
    { name: "Outreach", href: "/outreach", icon: Send, current: false },
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
          "fixed top-0 left-0 h-full bg-background border-r border-border z-50 transform transition-all duration-300 ease-in-out",
          collapsed ? "w-16 overflow-hidden" : "w-80 overflow-y-auto",
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
            {collapsed ? (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5"
                  title="Upload Resume"
                >
                  <Upload className="h-5 w-5" />
                </Button>
              </div>
            ) : (
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
            )}

            {/* Navigation */}
            <div>
              {!collapsed && (
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Navigate
                </h3>
              )}
              <nav className="space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center text-sm font-medium rounded-md transition-colors",
                      collapsed ? "px-2 py-2 justify-center" : "px-3 py-2",
                      item.current
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    onClick={onClose}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className={cn("h-4 w-4", !collapsed && "mr-3")} />
                    {!collapsed && item.name}
                  </Link>
                ))}
              </nav>
            </div>

            {!collapsed && <Separator />}

            {/* Library */}
            <div>
              {!collapsed && (
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Your Library
                </h3>
              )}
              <nav className="space-y-1">
                {library.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                      collapsed ? "px-2 py-2 justify-center" : "px-3 py-2 justify-between"
                    )}
                    onClick={onClose}
                    title={collapsed ? `${item.name} (${item.count})` : undefined}
                  >
                    {collapsed ? (
                      <div className="relative">
                        <item.icon className="h-4 w-4" />
                        {item.count && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-[8px] text-primary-foreground font-bold">
                              {item.count > 9 ? "9+" : item.count}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center">
                          <item.icon className="mr-3 h-4 w-4" />
                          {item.name}
                        </div>
                        {item.count && (
                          <Badge variant="secondary" className="text-xs">
                            {item.count}
                          </Badge>
                        )}
                      </>
                    )}
                  </Link>
                ))}
              </nav>
            </div>

            {!collapsed && <Separator />}

            {/* Categories - Show only in expanded state */}
            {!collapsed && (
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
            )}

            {!collapsed && <Separator />}

            {/* Quick Actions */}
            <div>
              {!collapsed && (
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Quick Actions
                </h3>
              )}
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className={cn(
                    "h-auto py-2",
                    collapsed
                      ? "w-10 justify-center px-2"
                      : "w-full justify-start gap-3"
                  )}
                  onClick={onClose}
                  title={collapsed ? "Post Job Description" : undefined}
                >
                  <Briefcase className="h-4 w-4" />
                  {!collapsed && "Post Job Description"}
                </Button>
                <Button
                  variant="ghost"
                  className={cn(
                    "h-auto py-2",
                    collapsed
                      ? "w-10 justify-center px-2"
                      : "w-full justify-start gap-3"
                  )}
                  onClick={onClose}
                  title={collapsed ? "Schedule Interview" : undefined}
                >
                  <Calendar className="h-4 w-4" />
                  {!collapsed && "Schedule Interview"}
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border p-4 space-y-2">
            <Link
              to="/settings"
              className={cn(
                "flex items-center text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
              )}
              onClick={onClose}
              title={collapsed ? "Settings" : undefined}
            >
              <Settings className="h-4 w-4" />
              {!collapsed && "Settings"}
            </Link>
            <Link
              to="/help"
              className={cn(
                "flex items-center text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
              )}
              onClick={onClose}
              title={collapsed ? "Help & Support" : undefined}
            >
              <HelpCircle className="h-4 w-4" />
              {!collapsed && "Help & Support"}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
