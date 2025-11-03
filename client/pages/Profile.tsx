import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit,
  Save,
  Camera,
  Eye,
  Star,
  TrendingUp,
  Clock,
  Settings,
  Building2,
  Briefcase,
  FileText,
  Download,
  Share,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import { uploadAvatar } from "@/lib/services/upload-service";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ShareModal from "@/components/ShareModal";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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

import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/hooks/use-sidebar";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { useAuth } from "@/lib/auth";
import {
  roleToSelectValue,
  formatRoleForDisplay,
  getAvailableRoles,
  createRolePermissions,
} from "@/lib/role-utils";

function ProfileContent() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { user, isAuthenticated, refreshUser } = useAuth();

  // Ensure we have fresh user data only on /profile
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser().catch((e) => {
        console.warn("Profile: refreshUser failed", e);
        // API client handles 401 errors automatically with logout + redirect
        // If we get here, the error was already processed
      });
    }
    // run once on mount

  }, []);

  // Form state for editing
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    phone: user?.phone || "",
    role: roleToSelectValue(user?.role),
    location: user?.location || "",
    bio: user?.bio || `Passionate ${formatRoleForDisplay(user?.role)} focused on building meaningful connections and driving career growth through innovative technology.`,
    headline: user?.headline || "",
    company: user?.currentCompany || "",
    title: user?.currentRole || "",
    website: user?.website || "",
    linkedIn: user?.linkedIn || "",
    gitHub: user?.github || "",
    twitter: user?.twitter || "",
    skills: user?.skills?.join(", ") || "",
    industries: user?.industries?.join(", ") || "",
    openToRemote: user?.openToRemote || false,
    preferredRoles: user?.preferredRoles?.join(", ") || "",
    salaryExpectation: user?.salaryExpectation?.toString() || "",
    salaryCurrency: user?.salaryCurrency || "USD",
  });

  const joinedText = (() => {
    const iso = (user as any)?.createdAt as string | undefined;
    if (!iso) return "Joined today";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Joined";
    return `Joined ${d.toLocaleString(undefined, { month: "long", year: "numeric" })}`;
  })();

  // Keep form in sync when user context updates
  useEffect(() => {
    if (!user) return;
    console.info("Profile: syncing form from user context", user);
    setFormData({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phone: user.phone || "",
      role: roleToSelectValue(user.role),
      location: user.location || "",
      bio: user.bio || `Passionate ${formatRoleForDisplay(user.role)} focused on building meaningful connections and driving career growth through innovative technology.`,
      headline: user.headline || "",
      company: user.currentCompany || "",
      title: user.currentRole || "",
      website: user.website || "",
      linkedIn: user.linkedIn || "",
      gitHub: user.github || "",
      twitter: user.twitter || "",
      skills: user.skills?.join(", ") || "",
      industries: user.industries?.join(", ") || "",
      openToRemote: user.openToRemote || false,
      preferredRoles: user.preferredRoles?.join(", ") || "",
      salaryExpectation: user.salaryExpectation?.toString() || "",
      salaryCurrency: user.salaryCurrency || "USD",
    });
  }, [user]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const { updateProfile } = useAuth();

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({
        firstName: formData.firstName,
        lastName: formData.lastName,
        bio: formData.bio,
        headline: formData.headline,
        location: formData.location,
        website: formData.website,
        linkedIn: formData.linkedIn,
        github: formData.gitHub,
        twitter: formData.twitter,
        phone: formData.phone,
        currentCompany: formData.company,
        currentRole: formData.title,
        skills: formData.skills ? formData.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
        industries: formData.industries ? formData.industries.split(",").map(s => s.trim()).filter(Boolean) : [],
        openToRemote: formData.openToRemote,
        preferredRoles: formData.preferredRoles ? formData.preferredRoles.split(",").map(s => s.trim()).filter(Boolean) : [],
        salaryExpectation: formData.salaryExpectation ? parseFloat(formData.salaryExpectation) : undefined,
        salaryCurrency: formData.salaryCurrency,
      });
      // Immediately switch to read-only on successful update
      setIsEditing(false);
      // Refresh in background; don't block UI transition
      refreshUser().catch((e) =>
        console.warn("refreshUser failed after save", e),
      );
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form data to original values
    setFormData({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      phone: user?.phone || "",
      role: roleToSelectValue(user?.role),
      location: user?.location || "",
      bio: user?.bio || `Passionate ${formatRoleForDisplay(user?.role)} focused on building meaningful connections and driving career growth through innovative technology.`,
      headline: user?.headline || "",
      company: user?.currentCompany || "",
      title: user?.currentRole || "",
      website: user?.website || "",
      linkedIn: user?.linkedIn || "",
      gitHub: user?.github || "",
      twitter: user?.twitter || "",
      skills: user?.skills?.join(", ") || "",
      industries: user?.industries?.join(", ") || "",
      openToRemote: user?.openToRemote || false,
      preferredRoles: user?.preferredRoles?.join(", ") || "",
      salaryExpectation: user?.salaryExpectation?.toString() || "",
      salaryCurrency: user?.salaryCurrency || "USD",
    });
    setIsEditing(false);
  };

  // If user is not authenticated, redirect to login
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

          <div className="pt-16">
            <div className="max-w-4xl mx-auto text-center py-12 sm:py-16 p-4 sm:p-6">
              <User className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-4" />
              <h1 className="text-xl sm:text-2xl font-bold mb-4">Sign In Required</h1>
              <p className="text-sm sm:text-base text-muted-foreground mb-6">
                Please sign in to view and edit your profile.
              </p>
              <Button asChild className="min-h-[44px]">
                <Link to="/login">Sign In</Link>
              </Button>
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
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Profile Header */}
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-20 h-20 sm:w-24 sm:h-24">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-lg sm:text-2xl">
                        {(formData.firstName[0] || "") +
                          (formData.lastName[0] || "")}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <>
                        <input
                          id="avatarInput"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              setSaving(true);
                              await uploadAvatar(file);
                              // Optimistically update UI
                              await refreshUser();
                            } catch (err) {
                              console.error("Avatar upload failed", err);
                            } finally {
                              setSaving(false);
                              // Clear input so same file can be re-selected
                              e.currentTarget.value = "";
                            }
                          }}
                        />
                        <Button
                          size="icon"
                          className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full"
                          onClick={() =>
                            document.getElementById("avatarInput")?.click()
                          }
                          disabled={saving}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <h1 className="text-xl sm:text-2xl font-bold">
                        {isEditing
                          ? `${formData.firstName} ${formData.lastName}`
                          : user.name}
                      </h1>
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto min-h-[44px]">
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSave}
                              disabled={saving}
                              className="flex items-center gap-2 w-full sm:w-auto min-h-[44px]"
                            >
                              <Save className="h-4 w-4" />
                              {saving ? "Saving..." : "Save Changes"}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 w-full sm:w-auto min-h-[44px]"
                          >
                            <Edit className="h-4 w-4" />
                            Edit Profile
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline">
                        {formatRoleForDisplay(formData.role)}
                      </Badge>
                      {user?.subscription && user.subscription !== "free" && (
                        <Badge variant="secondary" className="capitalize">
                          {user.subscription} Member
                        </Badge>
                      )}
                    </div>

                    {!isEditing ? (
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {formData.email}
                        </div>
                        {formData.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {formData.phone}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {formData.location}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {joinedText}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-6 space-y-6">
                    {/* Personal Information */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        Personal Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            value={formData.firstName}
                            onChange={(e) =>
                              handleInputChange("firstName", e.target.value)
                            }
                            className="min-h-[44px]"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            value={formData.lastName}
                            onChange={(e) =>
                              handleInputChange("lastName", e.target.value)
                            }
                            className="min-h-[44px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Contact Information */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        Contact Information
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email Address</Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                              handleInputChange("email", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number</Label>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="+1 (555) 123-4567"
                            value={formData.phone}
                            onChange={(e) =>
                              handleInputChange("phone", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="location">Location</Label>
                          <Input
                            id="location"
                            placeholder="City, State, Country"
                            value={formData.location}
                            onChange={(e) =>
                              handleInputChange("location", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Professional Information */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        Professional Information
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="role">Professional Role</Label>
                          <Select
                            value={formData.role}
                            onValueChange={(value) =>
                              handleInputChange("role", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailableRoles().map((roleOption) => (
                                <SelectItem
                                  key={roleOption.value}
                                  value={roleOption.value}
                                >
                                  {roleOption.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="title">Job Title</Label>
                          <Input
                            id="title"
                            placeholder="e.g. Senior Software Engineer"
                            value={formData.title}
                            onChange={(e) =>
                              handleInputChange("title", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="company">Company</Label>
                          <Input
                            id="company"
                            placeholder="e.g. Tech Corp"
                            value={formData.company}
                            onChange={(e) =>
                              handleInputChange("company", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="website">Website</Label>
                          <Input
                            id="website"
                            type="url"
                            placeholder="https://yourwebsite.com"
                            value={formData.website}
                            onChange={(e) =>
                              handleInputChange("website", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Headline */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">Professional Headline</h3>
                      <div className="space-y-2">
                        <Label htmlFor="headline">Headline</Label>
                        <Input
                          id="headline"
                          placeholder="e.g. Full-Stack Developer | React & Node.js Expert"
                          value={formData.headline}
                          onChange={(e) =>
                            handleInputChange("headline", e.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          A brief professional tagline that appears on your profile
                        </p>
                      </div>
                    </div>

                    {/* Social Profiles */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">Social Profiles</h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="linkedIn">LinkedIn</Label>
                          <Input
                            id="linkedIn"
                            type="url"
                            placeholder="https://linkedin.com/in/yourprofile"
                            value={formData.linkedIn}
                            onChange={(e) =>
                              handleInputChange("linkedIn", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="gitHub">GitHub</Label>
                          <Input
                            id="gitHub"
                            type="url"
                            placeholder="https://github.com/yourusername"
                            value={formData.gitHub}
                            onChange={(e) =>
                              handleInputChange("gitHub", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="twitter">Twitter</Label>
                          <Input
                            id="twitter"
                            type="url"
                            placeholder="https://twitter.com/yourusername"
                            value={formData.twitter}
                            onChange={(e) =>
                              handleInputChange("twitter", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Skills & Industries */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">Skills & Expertise</h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="skills">Skills</Label>
                          <Input
                            id="skills"
                            placeholder="e.g. JavaScript, React, Node.js, Python"
                            value={formData.skills}
                            onChange={(e) =>
                              handleInputChange("skills", e.target.value)
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Separate skills with commas
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="industries">Industries</Label>
                          <Input
                            id="industries"
                            placeholder="e.g. Technology, Finance, Healthcare"
                            value={formData.industries}
                            onChange={(e) =>
                              handleInputChange("industries", e.target.value)
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Separate industries with commas
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Job Preferences moved to Settings page for editing */}

                    {/* Bio */}
                    <div>
                      <h3 className="text-lg font-medium mb-4">Bio</h3>
                      <div className="space-y-2">
                        <Label htmlFor="bio">About You</Label>
                        <Textarea
                          id="bio"
                          placeholder="Tell us about yourself, your experience, and what you're looking for..."
                          rows={4}
                          value={formData.bio}
                          onChange={(e) =>
                            handleInputChange("bio", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium mb-3">About</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {formData.bio}
                    </p>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Manage your profile and career activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Role-based quick actions */}
                  {(() => {
                    const rolePermissions = createRolePermissions(user?.role);
                    if (rolePermissions.isJobSeeker) {
                      return (
                        <>
                          <Button
                            variant="outline"
                            className="h-auto p-3 sm:p-4 flex flex-col gap-2 min-h-[80px] text-center"
                            asChild
                          >
                            <Link to="/resumes">
                              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                              <span className="text-sm sm:text-base font-medium">Update Resume</span>
                              <span className="text-xs text-muted-foreground">
                                Upload or edit your resume
                              </span>
                            </Link>
                          </Button>

                          <Button
                            variant="outline"
                            className="h-auto p-4 flex flex-col gap-2"
                            asChild
                          >
                            <Link to="/jobs">
                              <Briefcase className="h-6 w-6" />
                              <span className="font-medium">
                                Job Applications
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Track your applications
                              </span>
                            </Link>
                          </Button>

                          <Button
                            variant="outline"
                            className="h-auto p-4 flex flex-col gap-2"
                            asChild
                          >


                            <Link to="/settings">
                              <Settings className="h-6 w-6" />
                              <span className="font-medium">
                                Account Settings
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Privacy & preferences
                              </span>
                            </Link>
                          </Button>

                          <Button
                            variant="outline"
                            className="h-auto p-4 flex flex-col gap-2"
                            onClick={() => setShareOpen(true)}
                          >
                            <Share className="h-6 w-6" />
                            <span className="font-medium">Share Profile</span>
                            <span className="text-xs text-muted-foreground">
                              Get your profile link
                            </span>
                          </Button>
                        </>
                      );
                    }

                    // recruiter/employer
                    return (
                      <>
                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          asChild
                        >
                          <Link to="/jobs/create">
                            <Briefcase className="h-6 w-6" />
                            <span className="font-medium">Post a Job</span>
                            <span className="text-xs text-muted-foreground">
                              Create a new job listing
                            </span>
                          </Link>
                        </Button>

                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          asChild
                        >
                          <Link to="/people">
                            <Eye className="h-6 w-6" />
                            <span className="font-medium">
                              Browse Candidates
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Search profiles & resumes
                            </span>
                          </Link>
                        </Button>

                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                          asChild
                        >
                          <Link to="/settings">
                            <Settings className="h-6 w-6" />
                            <span className="font-medium">
                              Account Settings
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Team & preferences
                            </span>
                          </Link>
                        </Button>

                        <Button
                          variant="outline"
                          className="h-auto p-4 flex flex-col gap-2"
                        >
                          <Share className="h-6 w-6" />
                          <span className="font-medium">Share Company</span>
                          <span className="text-xs text-muted-foreground">
                            Invite or share your page
                          </span>
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            <ShareModal
              open={shareOpen}
              onOpenChange={setShareOpen}
              shareUrl={`${window.location.origin}/people/${user?.slug || user?.id}`}
              title="Share Options"
              message="Please share by using an option below."
            />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

export default function Profile() {
  return (
    <PasswordRequirementsProvider>
      <ProfileContent />
    </PasswordRequirementsProvider>
  );
}
