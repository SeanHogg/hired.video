import {
  Cookie,
  Shield,
  Settings,
  BarChart3,
  Target,
  Users,
  Globe,
  Eye,
  CheckCircle2,
  X,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useState } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function CookiePolicy() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated } = useAuth();
  
  // Mock cookie preferences - in a real app, these would be managed by a cookie consent system
  const [cookiePreferences, setCookiePreferences] = useState({
    essential: true, // Always required
    analytics: true,
    marketing: false,
    personalization: true,
  });

  const cookieTypes = [
    {
      type: "Essential Cookies",
      icon: Shield,
      required: true,
      description: "Necessary for the website to function properly",
      examples: ["Authentication", "Security", "Load balancing", "Form submissions"],
      color: "green"
    },
    {
      type: "Analytics Cookies", 
      icon: BarChart3,
      required: false,
      description: "Help us understand how visitors interact with our website",
      examples: ["Page views", "Click tracking", "Performance monitoring", "Error reporting"],
      color: "blue"
    },
    {
      type: "Marketing Cookies",
      icon: Target,
      required: false, 
      description: "Used to deliver personalized advertisements",
      examples: ["Ad targeting", "Conversion tracking", "Social media integration", "Retargeting"],
      color: "purple"
    },
    {
      type: "Personalization Cookies",
      icon: Users,
      required: false,
      description: "Remember your preferences and provide customized content",
      examples: ["Language settings", "Theme preferences", "Recently viewed", "Saved searches"],
      color: "orange"
    }
  ];

  const handleCookiePreferenceChange = (type: string, enabled: boolean) => {
    if (type === 'essential') return; // Essential cookies cannot be disabled
    
    setCookiePreferences(prev => ({
      ...prev,
      [type]: enabled
    }));
  };

  const acceptAllCookies = () => {
    setCookiePreferences({
      essential: true,
      analytics: true,
      marketing: true,
      personalization: true,
    });
  };

  const rejectOptionalCookies = () => {
    setCookiePreferences({
      essential: true,
      analytics: false,
      marketing: false,
      personalization: false,
    });
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
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-4">
                <Cookie className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Cookie Policy
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">How We Use Cookies</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                We use cookies and similar technologies to enhance your experience, analyze our traffic, and provide personalized content.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: January 15, 2025
              </p>
            </div>

            {/* Cookie Preferences Panel */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Cookie Preferences
                </CardTitle>
                <CardDescription>
                  Manage your cookie preferences. Essential cookies are required for the site to function.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {cookieTypes.map((cookie, index) => {
                  const preferenceKey = cookie.type.toLowerCase().replace(' cookies', '') as keyof typeof cookiePreferences;
                  const isEnabled = cookiePreferences[preferenceKey];
                  
                  return (
                    <div key={index} className="flex items-start justify-between p-4 border rounded-lg">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          cookie.color === 'green' ? 'bg-green-100 dark:bg-green-900' :
                          cookie.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900' :
                          cookie.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900' :
                          'bg-orange-100 dark:bg-orange-900'
                        }`}
                        >
                          <cookie.icon className={`h-5 w-5 ${
                            cookie.color === 'green' ? 'text-green-600 dark:text-green-400' :
                            cookie.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                            cookie.color === 'purple' ? 'text-purple-600 dark:text-purple-400' :
                            'text-orange-600 dark:text-orange-400'
                          }`}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{cookie.type}</h4>
                            {cookie.required && (
                              <Badge variant="secondary" className="text-xs">Required</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{cookie.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Examples: {cookie.examples.join(', ')}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => handleCookiePreferenceChange(preferenceKey, checked)}
                          disabled={cookie.required}
                        />
                      </div>
                    </div>
                  );
                })}
                
                <div className="flex gap-3 pt-4">
                  <Button onClick={acceptAllCookies} className="flex-1">
                    Accept All Cookies
                  </Button>
                  <Button onClick={rejectOptionalCookies} variant="outline" className="flex-1">
                    Reject Optional Cookies
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* What Are Cookies */}
            <Card>
              <CardHeader>
                <CardTitle>What Are Cookies?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Cookies are small text files that are placed on your device when you visit a website. 
                  They help websites remember information about your visit, making your next visit easier and the site more useful to you.
                </p>
                
                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      First-Party Cookies
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Set directly by MyVideoResume to provide essential functionality and improve your experience.
                    </p>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      Third-Party Cookies
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Set by external services we use, such as analytics providers and advertising networks.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* How We Use Cookies */}
            <Card>
              <CardHeader>
                <CardTitle>How We Use Cookies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-medium mb-3">Essential Functions</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Keep you logged in during your session</li>
                    <li>Remember your language and region preferences</li>
                    <li>Ensure security and prevent fraud</li>
                    <li>Enable core platform functionality</li>
                  </ul>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-medium mb-3">Performance & Analytics</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Understand how you use our platform</li>
                    <li>Identify popular features and content</li>
                    <li>Monitor website performance and errors</li>
                    <li>Improve our services based on usage patterns</li>
                  </ul>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-medium mb-3">Personalization</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Remember your dashboard preferences</li>
                    <li>Suggest relevant job opportunities</li>
                    <li>Customize content based on your interests</li>
                    <li>Save your search filters and criteria</li>
                  </ul>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-medium mb-3">Marketing & Advertising</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Show relevant job advertisements</li>
                    <li>Measure advertising campaign effectiveness</li>
                    <li>Provide social media integration</li>
                    <li>Enable retargeting for our services</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Cookie Retention */}
            <Card>
              <CardHeader>
                <CardTitle>Cookie Retention</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">Session Cookies</h4>
                    <p className="text-sm text-muted-foreground">
                      Temporary cookies that are deleted when you close your browser. Used for essential functionality like maintaining your login session.
                    </p>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">Persistent Cookies</h4>
                    <p className="text-sm text-muted-foreground">
                      Remain on your device for a set period (typically 30 days to 2 years) or until you delete them. Used for preferences and analytics.
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                    Automatic Cleanup
                  </h4>
                  <p className="text-blue-700 dark:text-blue-300 text-sm">
                    We automatically delete old cookies and regularly review our cookie usage to minimize data collection while maintaining functionality.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Managing Cookies */}
            <Card>
              <CardHeader>
                <CardTitle>Managing Your Cookies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3">Browser Settings</h4>
                  <p className="text-muted-foreground mb-3">
                    You can control cookies through your browser settings:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
                    <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
                    <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
                    <li><strong>Edge:</strong> Settings → Cookies and site permissions → Cookies and site data</li>
                  </ul>
                </div>
                
                <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                        Impact of Disabling Cookies
                      </h4>
                      <p className="text-amber-700 dark:text-amber-300 text-sm">
                        Disabling certain cookies may limit website functionality. Essential cookies are required 
                        for the site to work properly and cannot be disabled.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Third-Party Services */}
            <Card>
              <CardHeader>
                <CardTitle>Third-Party Services</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  We use the following third-party services that may set cookies:
                </p>
                
                <div className="grid gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Google Analytics</h4>
                    <p className="text-sm text-muted-foreground mb-2">Website analytics and performance monitoring</p>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer" 
                      className="text-primary text-sm hover:underline"
                    >
                      View Google's Privacy Policy →
                    </a>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">LinkedIn Ads</h4>
                    <p className="text-sm text-muted-foreground mb-2">Professional networking and job advertising</p>
                    <a
                      href="https://www.linkedin.com/legal/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm hover:underline"
                    >
                      View LinkedIn's Privacy Policy →
                    </a>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Intercom</h4>
                    <p className="text-sm text-muted-foreground mb-2">Customer support and messaging</p>
                    <a
                      href="https://www.intercom.com/legal/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm hover:underline"
                    >
                      View Intercom's Privacy Policy →
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle>Questions About Cookies?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  If you have questions about our use of cookies or this policy, please contact us:
                </p>
                
                <div className="space-y-2">
                  <p className="text-sm">Email: <a href="mailto:privacy@myvideoresume.me" className="text-primary hover:underline">privacy@myvideoresume.me</a></p>
                  <p className="text-sm">Subject: Cookie Policy Inquiry</p>
                </div>
                
                <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    We review and update this Cookie Policy periodically. Check back regularly for any changes.
                  </p>
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
