import React, { useState, useEffect } from "react";
import {
  Settings,
  Building2,
  Globe,
  MapPin,
  Phone,
  Mail,
  Save,
  AlertCircle,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface AccountSettingsData {
  companyName: string;
  companyDescription: string;
  website: string;
  industry: string;
  companySize: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  language: string;
  emailNotifications: boolean;
  marketingEmails: boolean;
  weeklyReports: boolean;
  securityAlerts: boolean;
}

interface AccountSettingsProps {
  onSave: (settings: AccountSettingsData) => Promise<void>;
  initialData?: Partial<AccountSettingsData>;
  loading?: boolean;
  onLoadSettings?: () => Promise<any>;
}

export function AccountSettings({
  onSave,
  initialData,
  loading = false,
  onLoadSettings,
}: AccountSettingsProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settings, setSettings] = useState<AccountSettingsData>({
    companyName: initialData?.companyName || "",
    companyDescription: initialData?.companyDescription || "",
    website: initialData?.website || "",
    industry: initialData?.industry || "",
    companySize: initialData?.companySize || "",
    address: initialData?.address || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    zipCode: initialData?.zipCode || "",
    country: initialData?.country || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    timezone: initialData?.timezone || "UTC",
    currency: initialData?.currency || "USD",
    language: initialData?.language || "en",
    emailNotifications: initialData?.emailNotifications ?? true,
    marketingEmails: initialData?.marketingEmails ?? false,
    weeklyReports: initialData?.weeklyReports ?? true,
    securityAlerts: initialData?.securityAlerts ?? true,
  });

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (onLoadSettings && !initialData) {
        setLoadingSettings(true);
        try {
          const data = await onLoadSettings();
          setSettings((prev) => ({
            ...prev,
            companyName: data.companyName || "",
            email: data.email || "",
            // Map other fields from API response
          }));
        } catch (error) {
          toast({
            title: "Error loading settings",
            description: "Failed to load account settings.",
            variant: "destructive",
          });
        } finally {
          setLoadingSettings(false);
        }
      }
    };

    loadSettings();
  }, [onLoadSettings, initialData, toast]);

  const handleInputChange = (
    field: keyof AccountSettingsData,
    value: string | boolean,
  ) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(settings);
      toast({
        title: "Settings saved",
        description: "Your account settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error saving settings",
        description: "Failed to save account settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || loadingSettings) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Account Settings</h2>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          These settings apply to your entire organization and affect all team
          members.
        </AlertDescription>
      </Alert>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
          </CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={settings.companyName}
                onChange={(e) =>
                  handleInputChange("companyName", e.target.value)
                }
                placeholder="Enter company name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={settings.industry}
                onChange={(e) => handleInputChange("industry", e.target.value)}
                placeholder="e.g., Technology, Healthcare"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyDescription">Company Description</Label>
            <Textarea
              id="companyDescription"
              value={settings.companyDescription}
              onChange={(e) =>
                handleInputChange("companyDescription", e.target.value)
              }
              placeholder="Brief description of your company"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="website"
                  value={settings.website}
                  onChange={(e) => handleInputChange("website", e.target.value)}
                  placeholder="https://company.com"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="companySize">Company Size</Label>
              <Input
                id="companySize"
                value={settings.companySize}
                onChange={(e) =>
                  handleInputChange("companySize", e.target.value)
                }
                placeholder="e.g., 1-10, 11-50, 51-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Contact Information
          </CardTitle>
          <CardDescription>
            Contact details and address information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={settings.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="contact@company.com"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={settings.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={settings.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={settings.city}
                onChange={(e) => handleInputChange("city", e.target.value)}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={settings.state}
                onChange={(e) => handleInputChange("state", e.target.value)}
                placeholder="State"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP/Postal Code</Label>
              <Input
                id="zipCode"
                value={settings.zipCode}
                onChange={(e) => handleInputChange("zipCode", e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={settings.country}
              onChange={(e) => handleInputChange("country", e.target.value)}
              placeholder="United States"
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Regional and language preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={settings.timezone}
                onChange={(e) => handleInputChange("timezone", e.target.value)}
                placeholder="UTC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={settings.currency}
                onChange={(e) => handleInputChange("currency", e.target.value)}
                placeholder="USD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={settings.language}
                onChange={(e) => handleInputChange("language", e.target.value)}
                placeholder="English"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
          <CardDescription>
            Manage email notifications and alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications about account activity
              </p>
            </div>
            <Switch
              checked={settings.emailNotifications}
              onCheckedChange={(checked) =>
                handleInputChange("emailNotifications", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Marketing Emails</Label>
              <p className="text-sm text-muted-foreground">
                Receive updates about new features and promotions
              </p>
            </div>
            <Switch
              checked={settings.marketingEmails}
              onCheckedChange={(checked) =>
                handleInputChange("marketingEmails", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Weekly Reports</Label>
              <p className="text-sm text-muted-foreground">
                Receive weekly activity summaries
              </p>
            </div>
            <Switch
              checked={settings.weeklyReports}
              onCheckedChange={(checked) =>
                handleInputChange("weeklyReports", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Security Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Receive alerts about security events
              </p>
            </div>
            <Switch
              checked={settings.securityAlerts}
              onCheckedChange={(checked) =>
                handleInputChange("securityAlerts", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-32">
          {saving ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Saving...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save Settings
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
