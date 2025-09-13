import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  CreditCard,
  Download,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Lock,
  Zap,
  Target,
  Sliders,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { DeleteAccountDialog } from "@/components/account/DeleteAccountDialog";

export default function Settings() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    marketing: true,
    weekly: true,
  });
  const [privacy, setPrivacy] = useState({
    profileVisible: true,
    showEmail: false,
    showPhone: false,
    indexable: true,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
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

          <div className="pt-16">
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <SettingsIcon className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Smart Settings
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Customize Your Experience
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Take control of your profile, privacy, notifications, and
                  preferences with our comprehensive settings dashboard.
                  Personalize every aspect of your experience to match your
                  workflow.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Start Customizing
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <User className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Profile Management</CardTitle>
                    <CardDescription>
                      Customize your profile, update personal information, and
                      manage your professional presence across the platform.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Shield className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Privacy & Security</CardTitle>
                    <CardDescription>
                      Control your privacy settings, manage data visibility, and
                      configure security preferences for maximum protection.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Bell className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Smart Notifications</CardTitle>
                    <CardDescription>
                      Fine-tune your notification preferences to stay informed
                      about what matters most without overwhelming your inbox.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Benefits Section */}
              <div className="bg-white/50 rounded-2xl p-8 mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Why Our Settings Matter
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Sliders className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Granular Control</h3>
                      <p className="text-muted-foreground">
                        Fine-tune every aspect of your experience with detailed
                        settings and customization options.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Lock className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Privacy First</h3>
                      <p className="text-muted-foreground">
                        Your data is yours. Control what's shared, with whom,
                        and how your information is used.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Zap className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Instant Updates</h3>
                      <p className="text-muted-foreground">
                        Changes take effect immediately, so you can see and feel
                        the difference right away.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Target className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Smart Defaults</h3>
                      <p className="text-muted-foreground">
                        Intelligent default settings that learn from your
                        behavior and adapt to your preferences over time.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings Categories Preview */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Comprehensive Settings Categories
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card className="text-center p-6">
                    <User className="h-8 w-8 text-brand-purple mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">Profile</h3>
                    <p className="text-sm text-muted-foreground">
                      Personal info, bio, and professional details
                    </p>
                  </Card>
                  <Card className="text-center p-6">
                    <Bell className="h-8 w-8 text-brand-blue mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">Notifications</h3>
                    <p className="text-sm text-muted-foreground">
                      Email, push, and in-app notification preferences
                    </p>
                  </Card>
                  <Card className="text-center p-6">
                    <Shield className="h-8 w-8 text-brand-purple mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">Privacy</h3>
                    <p className="text-sm text-muted-foreground">
                      Data visibility and sharing controls
                    </p>
                  </Card>
                  <Card className="text-center p-6">
                    <Palette className="h-8 w-8 text-brand-blue mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">Appearance</h3>
                    <p className="text-sm text-muted-foreground">
                      Theme, layout, and display preferences
                    </p>
                  </Card>
                </div>
              </div>

              {/* CTA Section */}
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-6">
                  Ready to Take Control?
                </h2>
                <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Join thousands of users who have already customized their
                  experience to match their unique needs and preferences.
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    );
  }

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
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-1">
                  Manage your account settings and preferences
                </p>
              </div>
              <Badge variant="secondary">
                {getRoleDisplayLabel(user.role)}
              </Badge>
            </div>

            {/* Settings Tabs */}
            <Tabs defaultValue="notifications" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger
                  value="notifications"
                  className="flex items-center gap-2"
                >
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">Notifications</span>
                </TabsTrigger>
                <TabsTrigger
                  value="privacy"
                  className="flex items-center gap-2"
                >
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Privacy</span>
                </TabsTrigger>
                <TabsTrigger
                  value="appearance"
                  className="flex items-center gap-2"
                >
                  <Palette className="h-4 w-4" />
                  <span className="hidden sm:inline">Appearance</span>
                </TabsTrigger>
                <TabsTrigger
                  value="account"
                  className="flex items-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Account</span>
                </TabsTrigger>
              </TabsList>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                    <CardDescription>
                      Choose how you want to be notified about updates and
                      activities.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Email Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive notifications via email
                        </p>
                      </div>
                      <Switch
                        checked={notifications.email}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, email: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Push Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive browser push notifications
                        </p>
                      </div>
                      <Switch
                        checked={notifications.push}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, push: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Marketing Communications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive updates about new features and tips
                        </p>
                      </div>
                      <Switch
                        checked={notifications.marketing}
                        onCheckedChange={(checked) =>
                          setNotifications({
                            ...notifications,
                            marketing: checked,
                          })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Weekly Summary
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Get a weekly summary of your activity
                        </p>
                      </div>
                      <Switch
                        checked={notifications.weekly}
                        onCheckedChange={(checked) =>
                          setNotifications({
                            ...notifications,
                            weekly: checked,
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Privacy Tab */}
              <TabsContent value="privacy" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Privacy Settings</CardTitle>
                    <CardDescription>
                      Control who can see your information and how it's used.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Public Profile
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Make your profile visible to other users
                        </p>
                      </div>
                      <Switch
                        checked={privacy.profileVisible}
                        onCheckedChange={(checked) =>
                          setPrivacy({ ...privacy, profileVisible: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Show Email Address
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Display email on your public profile
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showEmail}
                        onCheckedChange={(checked) =>
                          setPrivacy({ ...privacy, showEmail: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Show Phone Number
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Display phone number on your public profile
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showPhone}
                        onCheckedChange={(checked) =>
                          setPrivacy({ ...privacy, showPhone: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Search Engine Indexing
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Allow search engines to index your profile
                        </p>
                      </div>
                      <Switch
                        checked={privacy.indexable}
                        onCheckedChange={(checked) =>
                          setPrivacy({ ...privacy, indexable: checked })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Appearance Tab */}
              <TabsContent value="appearance" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance Settings</CardTitle>
                    <CardDescription>
                      Customize the look and feel of your experience.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <Select defaultValue="system">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select defaultValue="en">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select defaultValue="utc-5">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="utc-8">
                            Pacific Time (UTC-8)
                          </SelectItem>
                          <SelectItem value="utc-7">
                            Mountain Time (UTC-7)
                          </SelectItem>
                          <SelectItem value="utc-6">
                            Central Time (UTC-6)
                          </SelectItem>
                          <SelectItem value="utc-5">
                            Eastern Time (UTC-5)
                          </SelectItem>
                          <SelectItem value="utc+0">GMT (UTC+0)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Account Tab */}
              <TabsContent value="account" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Management</CardTitle>
                    <CardDescription>
                      Manage your subscription, data, and account settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Data Export</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Download a copy of your data including profile, resumes,
                        and activity.
                      </p>
                      <Button variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Download Data
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Password</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Change your password to keep your account secure.
                      </p>
                      <Button variant="outline" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Change Password
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-destructive">
                        Delete Account
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Permanently delete your account and all associated data.
                        This action cannot be undone.
                      </p>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Account
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <Footer />
      </div>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
