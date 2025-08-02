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
  FileText,
  Users,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Scale,
  Globe,
  CreditCard,
} from "lucide-react";

export default function TermsOfService() {
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
                <Scale className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Terms of Service
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                These terms govern your use of MyVideoResume and outline the rights and responsibilities of all users.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: January 15, 2025
              </p>
            </div>

            {/* Agreement Notice */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-medium text-primary mb-2">Agreement to Terms</h3>
                    <p className="text-muted-foreground">
                      By accessing or using MyVideoResume, you agree to be bound by these Terms of Service. 
                      If you do not agree to these terms, please do not use our service.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Sections */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>1. Description of Service</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    MyVideoResume is a career platform that provides:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>AI-powered video resume creation and enhancement tools</li>
                    <li>Job matching and recruitment services</li>
                    <li>Professional networking and communication features</li>
                    <li>Career development resources and analytics</li>
                    <li>Employer and recruiter tools for talent acquisition</li>
                  </ul>
                  
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      Service Availability
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      We strive to maintain 99.9% uptime, but cannot guarantee uninterrupted access. 
                      We may temporarily suspend service for maintenance or updates.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>2. User Accounts and Registration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Account Requirements</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You must be at least 16 years old to create an account</li>
                      <li>Provide accurate and complete registration information</li>
                      <li>Maintain the security of your account credentials</li>
                      <li>One account per person - multiple accounts are prohibited</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Account Responsibilities</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You are responsible for all activity under your account</li>
                      <li>Notify us immediately of any unauthorized access</li>
                      <li>Keep your profile information current and accurate</li>
                      <li>Comply with all applicable laws and regulations</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>3. Acceptable Use Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2 text-green-600">You May:</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Create and share professional video resumes</li>
                      <li>Search and apply for job opportunities</li>
                      <li>Network with other professionals</li>
                      <li>Use our AI tools for career enhancement</li>
                      <li>Share content that is professional and appropriate</li>
                    </ul>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-2 text-red-600">You May Not:</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Upload false, misleading, or fraudulent information</li>
                      <li>Harass, abuse, or discriminate against other users</li>
                      <li>Share inappropriate, offensive, or illegal content</li>
                      <li>Attempt to hack, manipulate, or disrupt our service</li>
                      <li>Use our platform for spam or unsolicited marketing</li>
                      <li>Violate any applicable laws or regulations</li>
                    </ul>
                  </div>
                  
                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
                          Violation Consequences
                        </h4>
                        <p className="text-red-700 dark:text-red-300 text-sm">
                          Violation of these terms may result in account suspension, content removal, 
                          or permanent ban from our platform.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>4. Content and Intellectual Property</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Your Content</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You retain ownership of content you upload (resumes, videos, profiles)</li>
                      <li>You grant us a license to use your content to provide our services</li>
                      <li>You represent that you have the right to share all content you upload</li>
                      <li>You're responsible for ensuring your content doesn't infringe on others' rights</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Our Content</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>MyVideoResume platform, design, and features are our intellectual property</li>
                      <li>You may not copy, modify, or distribute our platform or content</li>
                      <li>Our AI-generated suggestions and improvements remain our property</li>
                      <li>All trademarks and logos are owned by their respective owners</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>5. Privacy and Data Protection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Your privacy is important to us. Please review our Privacy Policy to understand how we collect, 
                    use, and protect your personal information.
                  </p>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">Key Privacy Points</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>We collect only necessary information to provide our services</li>
                      <li>Your data is encrypted and securely stored</li>
                      <li>You control the visibility and sharing of your profile</li>
                      <li>We never sell your personal information to third parties</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>6. Payment and Billing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Subscription Plans</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Free and paid subscription plans are available</li>
                      <li>Subscription fees are billed in advance on a recurring basis</li>
                      <li>Price changes will be communicated 30 days in advance</li>
                      <li>You can cancel or modify your subscription at any time</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Refund Policy</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>14-day money-back guarantee for new subscribers</li>
                      <li>Refunds processed within 5-7 business days</li>
                      <li>Pro-rated refunds for annual plans (after 14-day period)</li>
                      <li>No refunds for partially used subscription periods</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>7. Disclaimers and Limitations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                          Service Disclaimer
                        </h4>
                        <ul className="text-amber-700 dark:text-amber-300 text-sm space-y-1 ml-4 list-disc list-inside">
                          <li>We provide the platform "as is" without warranties</li>
                          <li>We don't guarantee job placement or interview success</li>
                          <li>AI-generated content may not always be accurate</li>
                          <li>We're not responsible for third-party content or actions</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Limitation of Liability</h4>
                    <p className="text-muted-foreground text-sm">
                      Our liability is limited to the amount you paid for our services in the 12 months 
                      preceding any claim. We're not liable for indirect, incidental, or consequential damages.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>8. Termination</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Your Right to Terminate</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You can delete your account at any time from account settings</li>
                      <li>Upon deletion, your personal data will be removed within 30 days</li>
                      <li>Some information may be retained for legal or safety purposes</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Our Right to Terminate</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>We may suspend or terminate accounts for terms violations</li>
                      <li>We may discontinue the service with 30 days' notice</li>
                      <li>Immediate termination for serious violations or illegal activity</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>9. Changes to Terms</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    We may update these terms from time to time. When we do:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>We'll notify you via email or platform notification</li>
                    <li>Changes become effective 30 days after notification</li>
                    <li>Continued use of the service constitutes acceptance</li>
                    <li>Previous versions will be archived and available upon request</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>10. Contact Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Questions about these Terms of Service? Contact our legal team:
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <span>legal@myvideoresume.me</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span>MyVideoResume Legal Department</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Governing Law:</strong> These terms are governed by the laws of California, United States. 
                      Any disputes will be resolved through binding arbitration.
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
