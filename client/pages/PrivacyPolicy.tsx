import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  Shield,
  Eye,
  Lock,
  Server,
  Users,
  Mail,
  Calendar,
  FileText,
  AlertTriangle,
  Globe,
} from "lucide-react";

export default function PrivacyPolicy() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated } = useAuth();

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
                <Shield className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Privacy Policy
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">Your Privacy Matters</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                We're committed to protecting your personal information and being transparent about how we collect, use, and share your data.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: January 15, 2025
              </p>
            </div>

            {/* Quick Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Quick Overview
                </CardTitle>
                <CardDescription>
                  Here's what you need to know about your privacy on MyVideoResume
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Lock className="h-5 w-5 text-green-600 mt-1" />
                    <div>
                      <h4 className="font-medium">Your Data is Secure</h4>
                      <p className="text-sm text-muted-foreground">We use industry-standard encryption and security measures</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <h4 className="font-medium">You Control Your Info</h4>
                      <p className="text-sm text-muted-foreground">You can view, edit, or delete your personal data anytime</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Server className="h-5 w-5 text-purple-600 mt-1" />
                    <div>
                      <h4 className="font-medium">Minimal Data Collection</h4>
                      <p className="text-sm text-muted-foreground">We only collect what's necessary to provide our service</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-orange-600 mt-1" />
                    <div>
                      <h4 className="font-medium">No Selling Your Data</h4>
                      <p className="text-sm text-muted-foreground">We never sell your personal information to third parties</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Sections */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>1. Information We Collect</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Personal Information</h4>
                    <p className="text-muted-foreground mb-2">
                      When you create an account, we collect:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Name and email address</li>
                      <li>Professional information (job title, experience, skills)</li>
                      <li>Profile photo and video resume content</li>
                      <li>Contact information you choose to share</li>
                    </ul>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-2">Usage Information</h4>
                    <p className="text-muted-foreground mb-2">
                      We automatically collect:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>How you use our platform (pages visited, features used)</li>
                      <li>Device information (browser type, operating system)</li>
                      <li>Log data (IP address, access times)</li>
                      <li>Cookies and similar tracking technologies</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>2. How We Use Your Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">To Provide Our Service</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Create and maintain your account</li>
                        <li>Process and store your video resumes</li>
                        <li>Match you with relevant job opportunities</li>
                        <li>Enable communication between job seekers and recruiters</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">To Improve Our Platform</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Analyze usage patterns to enhance user experience</li>
                        <li>Develop new features and functionality</li>
                        <li>Train AI models for better job matching</li>
                        <li>Provide customer support and respond to inquiries</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">For Communication</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Send important updates about your account</li>
                        <li>Notify you about job matches and opportunities</li>
                        <li>Provide customer support</li>
                        <li>Send marketing communications (with your consent)</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>3. Information Sharing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                      <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                        We Never Sell Your Data
                      </h4>
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        Your personal information is never sold to third parties for marketing or any other purposes.
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">When We Share Information</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li><strong>With Your Consent:</strong> When you apply to jobs or make your profile public</li>
                        <li><strong>Service Providers:</strong> Third-party services that help us operate our platform</li>
                        <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                        <li><strong>Business Transfers:</strong> In the event of a merger or acquisition</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>4. Data Security</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      We implement industry-standard security measures to protect your personal information:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Encryption of data in transit and at rest</li>
                      <li>Regular security audits and vulnerability assessments</li>
                      <li>Access controls and authentication requirements</li>
                      <li>Secure hosting infrastructure with leading cloud providers</li>
                      <li>Employee training on data protection and privacy</li>
                    </ul>
                    
                    <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                            No System is 100% Secure
                          </h4>
                          <p className="text-amber-700 dark:text-amber-300 text-sm">
                            While we use best practices to protect your data, no internet transmission is completely secure. 
                            Please keep your account credentials confidential.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>5. Your Rights and Choices</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      You have several rights regarding your personal information:
                    </p>
                    
                    <div className="grid gap-4">
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">Access and Portability</h4>
                        <p className="text-muted-foreground text-sm">
                          Request a copy of your personal data and download your information.
                        </p>
                      </div>
                      
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">Correction and Updates</h4>
                        <p className="text-muted-foreground text-sm">
                          Update or correct your personal information through your account settings.
                        </p>
                      </div>
                      
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">Deletion</h4>
                        <p className="text-muted-foreground text-sm">
                          Request deletion of your account and personal data (subject to legal requirements).
                        </p>
                      </div>
                      
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">Marketing Communications</h4>
                        <p className="text-muted-foreground text-sm">
                          Opt out of marketing emails and notifications at any time.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>6. Contact Us</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    If you have questions about this Privacy Policy or how we handle your data, please contact us:
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <span>privacy@myvideoresume.me</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span>MyVideoResume Privacy Team</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Response Time:</strong> We aim to respond to all privacy inquiries within 72 hours. 
                      For urgent matters, please include "URGENT" in your subject line.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
