import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  User,
  Mail,
  MapPin,
  Calendar,
  Briefcase,
  Star,
  Edit,
  Camera,
  Save,
  X,
  Settings,
  Shield,
  Bell,
  Globe,
  Eye,
  FileText,
  Video,
  BarChart3,
  Users,
  Building2,
} from "lucide-react";

export default function Profile() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const [isEditing, setIsEditing] = useState(false);
  const { user, isAuthenticated } = useAuth();

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={closeSidebar} 
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation 
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          
          <div className="pt-16 min-h-screen flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <CardTitle>Access Denied</CardTitle>
                <CardDescription>Please log in to view your profile</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Link to="/login">
                  <Button>Sign In</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const userStats = {
    profileViews: 1247,
    connections: 156,
    resumeViews: 2847,
    jobApplications: 45,
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={closeSidebar} 
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation 
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Profile Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-6">
                  <div className="relative">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-2xl">
                        {user.name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <Button size="icon" className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full">
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h1 className="text-2xl font-bold">{user.name}</h1>
                      <Button
                        variant={isEditing ? "default" : "outline"}
                        onClick={() => setIsEditing(!isEditing)}
                        className="flex items-center gap-2"
                      >
                        {isEditing ? (
                          <>
                            <Save className="h-4 w-4" />
                            Save Changes
                          </>
                        ) : (
                          <>
                            <Edit className="h-4 w-4" />
                            Edit Profile
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="capitalize">
                        {user.role?.replace('_', ' ')}
                      </Badge>
                      <Badge variant="secondary">
                        Pro Member
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {user.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        San Francisco, CA
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Joined December 2024
                      </div>
                    </div>
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Full Name</Label>
                        <Input defaultValue={user.name} />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input defaultValue={user.email} />
                      </div>
                    </div>
                    <div>
                      <Label>Bio</Label>
                      <textarea 
                        className="w-full p-3 border rounded-md resize-none"
                        rows={3}
                        placeholder="Tell us about yourself..."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-muted-foreground">
                      Passionate {user.role?.replace('_', ' ')} focused on building meaningful connections and driving career growth through innovative technology.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profile Stats */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{userStats.profileViews.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Profile Views</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{userStats.connections}</div>
                  <div className="text-sm text-muted-foreground">Connections</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{userStats.resumeViews.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Resume Views</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <Briefcase className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{userStats.jobApplications}</div>
                  <div className="text-sm text-muted-foreground">Applications</div>
                </CardContent>
              </Card>
            </div>

            {/* Profile Sections */}
            <div className="grid md:grid-cols-2 gap-6">
              
              {/* Activity & Achievements */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                    <div>
                      <p className="text-sm font-medium">Profile viewed by Google recruiter</p>
                      <p className="text-xs text-muted-foreground">2 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                    <div>
                      <p className="text-sm font-medium">Connected with Sarah Johnson</p>
                      <p className="text-xs text-muted-foreground">5 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                    <div>
                      <p className="text-sm font-medium">Updated video resume</p>
                      <p className="text-xs text-muted-foreground">1 day ago</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Account Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Account Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      <span className="text-sm">Email Notifications</span>
                    </div>
                    <Badge variant="secondary">Enabled</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="text-sm">Profile Visibility</span>
                    </div>
                    <Badge variant="secondary">Public</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm">Two-Factor Auth</span>
                    </div>
                    <Badge variant="outline">Setup</Badge>
                  </div>
                  
                  <Separator />
                  
                  <Button variant="outline" className="w-full">
                    Manage Account Settings
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4">
                  <Button variant="outline" className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Update Video Resume
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Download Resume
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    View Analytics
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Find Connections
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
