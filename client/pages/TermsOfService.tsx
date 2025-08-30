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
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Copyright from "@/components/Copyright";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function TermsOfService() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // SEO for terms of service page
  useSEO(location.pathname);
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
                These Legal Terms constitute a legally binding agreement made between you and MyVideoResu.ME, concerning your access to and use of the Services.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: March 30, {new Date().getFullYear()}
              </p>
            </div>

            {/* Agreement Notice */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-medium text-primary mb-2">
                      Agreement to Our Legal Terms
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      We are MyVideoResu.ME (dba Fix Faster LLC), care of HireFractionalTalent.com, a company registered in Michigan, United States in Troy, MI. We operate the website https://myvideoresu.me and related services.
                    </p>
                    <p className="text-muted-foreground mb-4">
                      <strong>You can contact us by:</strong><br />
                      Phone: (+1) 248 825 0176<br />
                      Email: info@myvideoresu.me
                    </p>
                    <p className="text-muted-foreground">
                      <strong>IF YOU DO NOT AGREE WITH ALL OF THESE LEGAL TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND YOU MUST DISCONTINUE USE IMMEDIATELY.</strong>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Age Requirements */}
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-600 mt-1" />
                  <div>
                    <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Age Requirements
                    </h3>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      The Services are intended for users who are at least 13 years of age. All users who are minors (generally under 18) must have permission from and be directly supervised by their parent or guardian. If you are a minor, your parent or guardian must read and agree to these Legal Terms prior to your use of the Services.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Sections */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>1. Our Services</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The information provided when using the Services is not intended for distribution to or use by any person or entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or which would subject us to any registration requirement within such jurisdiction or country.
                  </p>

                  <p className="text-muted-foreground">
                    MyVideoResu.ME is a career platform that provides:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>AI-powered video resume creation and enhancement tools</li>
                    <li>Job matching and recruitment services</li>
                    <li>Professional networking and communication features</li>
                    <li>Career development resources and analytics</li>
                    <li>Employer and recruiter tools for talent acquisition</li>
                  </ul>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Regulatory Compliance
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      The Services are not tailored to comply with industry-specific regulations (HIPAA, FISMA, etc.). If your interactions would be subject to such laws, you may not use the Services. You may not use the Services in a way that would violate the Gramm-Leach-Bliley Act (GLBA).
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      Service Availability
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      Those persons who choose to access the Services from other locations do so on their own initiative and are solely responsible for compliance with local laws, if and to the extent local laws are applicable.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>2. Intellectual Property Rights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Our Intellectual Property</h4>
                    <p className="text-muted-foreground mb-2">
                      We are the owner or the licensee of all intellectual property rights in our Services, including all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics in the Services (collectively, the "Content"), as well as the trademarks, service marks, and logos contained therein (the "Marks").
                    </p>
                    <p className="text-muted-foreground">
                      Our Content and Marks are protected by copyright and trademark laws and treaties in the United States and around the world. The Content and Marks are provided "AS IS" for your personal, non-commercial use or internal business purpose only.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Your Use of Our Services</h4>
                    <p className="text-muted-foreground mb-2">
                      Subject to your compliance with these Legal Terms, we grant you a non-exclusive, non-transferable, revocable license to:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Access the Services</li>
                      <li>Download or print a copy of any portion of the Content to which you have properly gained access</li>
                      <li>Use solely for your personal, non-commercial use or internal business purpose</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Your Submissions and Contributions</h4>
                    <p className="text-muted-foreground mb-2">
                      <strong>Submissions:</strong> By directly sending us any question, comment, suggestion, idea, feedback, or other information about the Services, you agree to assign to us all intellectual property rights in such Submission.
                    </p>
                    <p className="text-muted-foreground mb-2">
                      <strong>Contributions:</strong> When you post Contributions, you grant us an unrestricted, unlimited, irrevocable, perpetual, non-exclusive, transferable, royalty-free, fully-paid, worldwide right and license to use, copy, reproduce, distribute, sell, resell, publish, broadcast, retitle, store, publicly perform, publicly display, reformat, translate, excerpt, and exploit your Contributions for any purpose.
                    </p>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                      Important Restrictions
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      No part of the Services and no Content or Marks may be copied, reproduced, aggregated, republished, uploaded, posted, publicly displayed, encoded, translated, transmitted, distributed, sold, licensed, or otherwise exploited for any commercial purpose whatsoever, without our express prior written permission.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>3. User Representations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    By using the Services, you represent and warrant that:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>All registration information you submit will be true, accurate, current, and complete</li>
                    <li>You will maintain the accuracy of such information and promptly update registration information as necessary</li>
                    <li>You have the legal capacity and agree to comply with these Legal Terms</li>
                    <li>You are not under the age of 13</li>
                    <li>You are not a minor in the jurisdiction in which you reside, or if a minor, you have received parental permission to use the Services</li>
                    <li>You will not access the Services through automated or non-human means</li>
                    <li>You will not use the Services for any illegal or unauthorized purpose</li>
                    <li>Your use of the Services will not violate any applicable law or regulation</li>
                  </ul>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      <strong>Account Termination:</strong> If you provide any information that is untrue, inaccurate, not current, or incomplete, we have the right to suspend or terminate your account and refuse any and all current or future use of the Services.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>4. User Registration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    You may be required to register to use the Services. You agree to keep your password confidential and will be responsible for all use of your account and password.
                  </p>

                  <div>
                    <h4 className="font-medium mb-2">Account Requirements</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You must be at least 13 years old to create an account</li>
                      <li>Provide accurate and complete registration information</li>
                      <li>Maintain the security of your account credentials</li>
                      <li>Keep your password confidential</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Account Responsibilities</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You are responsible for all use of your account and password</li>
                      <li>Notify us immediately of any unauthorized access</li>
                      <li>Keep your profile information current and accurate</li>
                      <li>Comply with all applicable laws and regulations</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>Username Policy:</strong> We reserve the right to remove, reclaim, or change a username you select if we determine, in our sole discretion, that such username is inappropriate, obscene, or otherwise objectionable.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>5. Purchases and Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Accepted Payment Methods</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>Visa</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>Mastercard</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>American Express</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>Discover</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>PayPal</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Payment Terms</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You agree to provide current, complete, and accurate purchase and account information</li>
                      <li>Promptly update account and payment information as needed</li>
                      <li>Sales tax will be added to purchases as deemed required</li>
                      <li>All payments shall be in US dollars</li>
                      <li>We may change prices at any time</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Order Processing
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      We reserve the right to refuse any order, correct pricing errors, and limit quantities purchased per person, household, or order. We may limit or prohibit orders that appear to be placed by dealers, resellers, or distributors.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>6. Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Billing and Renewal</h4>
                    <p className="text-muted-foreground mb-2">
                      Your subscription will continue and automatically renew unless canceled. You consent to our charging your payment method on a recurring basis without requiring your prior approval for each recurring charge, until such time as you cancel the applicable order.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Free Trial</h4>
                    <p className="text-muted-foreground mb-2">
                      We offer a 30-day free trial to new users who register with the Services. The account will be charged according to the user's chosen subscription at the end of the free trial.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Cancellation</h4>
                    <p className="text-muted-foreground mb-2">
                      All purchases are non-refundable. You can cancel your subscription at any time by logging into your account. Your cancellation will take effect at the end of the current paid term.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Fee Changes</h4>
                    <p className="text-muted-foreground mb-2">
                      We may, from time to time, make changes to the subscription fee and will communicate any price changes to you in accordance with applicable law.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>Questions or Concerns:</strong> If you have any questions or are unsatisfied with our Services, please email us at info@myvideoresu.me.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>7. Prohibited Activities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    You may not access or use the Services for any purpose other than that for which we make the Services available. The Services may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us.
                  </p>

                  <div>
                    <h4 className="font-medium mb-2 text-red-600">As a user of the Services, you agree not to:</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                        <li>Systematically retrieve data to create collections or databases without permission</li>
                        <li>Trick, defraud, or mislead us and other users</li>
                        <li>Circumvent or interfere with security-related features</li>
                        <li>Disparage, tarnish, or harm us and/or the Services</li>
                        <li>Use information to harass, abuse, or harm another person</li>
                        <li>Make improper use of support services</li>
                        <li>Use Services inconsistent with applicable laws</li>
                        <li>Engage in unauthorized framing or linking</li>
                        <li>Upload viruses, Trojan horses, or harmful material</li>
                        <li>Engage in automated use of the system</li>
                        <li>Delete copyright or proprietary rights notices</li>
                        <li>Attempt to impersonate another user</li>
                      </ul>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                        <li>Upload passive information collection mechanisms</li>
                        <li>Interfere with or disrupt the Services</li>
                        <li>Harass our employees or agents</li>
                        <li>Attempt to bypass access restrictions</li>
                        <li>Copy or adapt the Services' software</li>
                        <li>Decipher, decompile, or reverse engineer software</li>
                        <li>Use automated systems like spiders or robots</li>
                        <li>Use buying or purchasing agents</li>
                        <li>Make unauthorized use for unsolicited email</li>
                        <li>Use Services to compete with us</li>
                        <li>Use Services to advertise or sell goods</li>
                        <li>Sell or transfer your profile</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
                          Violation Consequences
                        </h4>
                        <p className="text-red-700 dark:text-red-300 text-sm">
                          Violations may result in account suspension, termination, or legal action. We reserve the right to investigate and take appropriate action against users who violate these terms.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>8. User Generated Contributions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Services may invite you to chat, contribute to, or participate in blogs, message boards, online forums, and other functionality, and may provide you with the opportunity to create, submit, post, display, transmit, perform, publish, distribute, or broadcast content and materials to us or on the Services, including but not limited to text, writings, video, audio, photographs, graphics, comments, suggestions, or personal information or other material (collectively, "Contributions").
                  </p>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Important Notice
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      Contributions may be viewable by other users of the Services and through third-party websites. As such, any Contributions you transmit may be treated as non-confidential and non-proprietary.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">When you create or make available any Contributions, you represent and warrant that:</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                        <li>The creation, distribution, transmission, public display, or performance of your Contributions do not infringe proprietary rights of any third party</li>
                        <li>You are the creator and owner or have necessary licenses, rights, consents, releases, and permissions</li>
                        <li>You have written consent of each identifiable individual person in your Contributions</li>
                        <li>Your Contributions are not false, inaccurate, or misleading</li>
                        <li>Your Contributions are not unsolicited advertising, promotional materials, pyramid schemes, chain letters, spam, or mass mailings</li>
                        <li>Your Contributions are not obscene, lewd, lascivious, filthy, violent, harassing, libelous, slanderous, or otherwise objectionable</li>
                        <li>Your Contributions do not ridicule, mock, disparage, intimidate, or abuse anyone</li>
                      </ul>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                        <li>Your Contributions are not used to harass or threaten any other person and do not promote violence</li>
                        <li>Your Contributions do not violate any applicable law, regulation, or rule</li>
                        <li>Your Contributions do not violate privacy or publicity rights of any third party</li>
                        <li>Your Contributions do not violate any applicable law concerning child pornography or protection of minors</li>
                        <li>Your Contributions do not include offensive comments connected to race, national origin, gender, sexual preference, or physical handicap</li>
                        <li>Your Contributions do not otherwise violate any provision of these Legal Terms or any applicable law</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      <strong>Violation Warning:</strong> Any use of the Services in violation of the foregoing violates these Legal Terms and may result in, among other things, termination or suspension of your rights to use the Services.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>9. Contribution License</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      License Grant
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      By posting your Contributions to any part of the Services or making Contributions accessible to the Services by linking your account from the Services to any of your social networking accounts, you automatically grant, and you represent and warrant that you have the right to grant, to us an unrestricted, unlimited, irrevocable, perpetual, non-exclusive, transferable, royalty-free, fully-paid, worldwide right and license.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Rights Granted to Us</h4>
                    <p className="text-muted-foreground mb-2">
                      This license includes the right to host, use, copy, reproduce, disclose, sell, resell, publish, broadcast, retitle, archive, store, cache, publicly perform, publicly display, reformat, translate, transmit, excerpt (in whole or in part), and distribute such Contributions (including, without limitation, your image and voice) for any purpose, commercial, advertising, or otherwise, and to prepare derivative works of, or incorporate into other works, such Contributions.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">License Scope</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>This license applies to any form, media, or technology now known or hereafter developed</li>
                      <li>Includes our use of your name, company name, and franchise name, as applicable</li>
                      <li>Includes any trademarks, service marks, trade names, logos, and personal and commercial images you provide</li>
                      <li>You waive all moral rights in your Contributions</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Your Ownership and Our Rights</h4>
                    <p className="text-muted-foreground mb-2">
                      We do not assert any ownership over your Contributions. You retain full ownership of all of your Contributions and any intellectual property rights or other proprietary rights associated with your Contributions. However, you are solely responsible for your Contributions to the Services and you expressly agree to exonerate us from any and all responsibility.
                    </p>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Our Editorial Rights
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      We have the right, in our sole and absolute discretion, to: (1) edit, redact, or otherwise change any Contributions; (2) re-categorize any Contributions to place them in more appropriate locations; and (3) pre-screen or delete any Contributions at any time and for any reason, without notice. We have no obligation to monitor your Contributions.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>10. Social Media</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    As part of the functionality of the Services, you may link your account with online accounts you have with third-party service providers (each such account, a "Third-Party Account") by either: (1) providing your Third-Party Account login information through the Services; or (2) allowing us to access your Third-Party Account, as is permitted under the applicable terms and conditions that govern your use of each Third-Party Account.
                  </p>

                  <div>
                    <h4 className="font-medium mb-2">Third-Party Account Integration</h4>
                    <p className="text-muted-foreground mb-2">
                      You represent and warrant that you are entitled to disclose your Third-Party Account login information to us and/or grant us access to your Third-Party Account, without breach by you of any of the terms and conditions that govern your use of the applicable Third-Party Account.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Social Network Content</h4>
                    <p className="text-muted-foreground mb-2">
                      By granting us access to any Third-Party Accounts, you understand that we may access, make available, and store (if applicable) any content that you have provided to and stored in your Third-Party Account (the "Social Network Content") so that it is available on and through the Services via your account, including without limitation any friend lists.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Contact List Access</h4>
                    <p className="text-muted-foreground mb-2">
                      We may access your email address book associated with a Third-Party Account and your contacts list stored on your mobile device or tablet computer solely for purposes of identifying and informing you of those contacts who have also registered to use the Services.
                    </p>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Important Notice
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      YOUR RELATIONSHIP WITH THE THIRD-PARTY SERVICE PROVIDERS ASSOCIATED WITH YOUR THIRD-PARTY ACCOUNTS IS GOVERNED SOLELY BY YOUR AGREEMENT(S) WITH SUCH THIRD-PARTY SERVICE PROVIDERS. We make no effort to review any Social Network Content for any purpose, including but not limited to, for accuracy, legality, or non-infringement, and we are not responsible for any Social Network Content.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>Deactivation:</strong> You can deactivate the connection between the Services and your Third-Party Account by contacting us using the contact information below or through your account settings (if applicable). We will attempt to delete any information stored on our servers that was obtained through such Third-Party Account, except the username and profile picture that become associated with your account.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>11. Third-Party Websites and Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Services may contain (or you may be sent via the Site) links to other websites ("Third-Party Websites") as well as articles, photographs, text, graphics, pictures, designs, music, sound, video, information, applications, software, and other content or items belonging to or originating from third parties ("Third-Party Content").
                  </p>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                          Third-Party Content Disclaimer
                        </h4>
                        <p className="text-amber-700 dark:text-amber-300 text-sm">
                          Such Third-Party Websites and Third-Party Content are not investigated, monitored, or checked for accuracy, appropriateness, or completeness by us, and we are not responsible for any Third-Party Websites accessed through the Services or any Third-Party Content posted on, available through, or installed from the Services.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">No Endorsement</h4>
                    <p className="text-muted-foreground mb-2">
                      Inclusion of, linking to, or permitting the use or installation of any Third-Party Websites or any Third-Party Content does not imply approval or endorsement thereof by us. If you decide to leave the Services and access the Third-Party Websites or to use or install any Third-Party Content, you do so at your own risk.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">User Responsibility</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>You should review the applicable terms and policies of any website you navigate to from the Services</li>
                      <li>Review privacy and data gathering practices of any applications you use or install</li>
                      <li>Any purchases through Third-Party Websites are exclusively between you and the applicable third party</li>
                      <li>We take no responsibility for purchases made through Third-Party Websites</li>
                    </ul>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                      Limitation of Liability
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      You agree and acknowledge that we do not endorse the products or services offered on Third-Party Websites and you shall hold us blameless from any harm caused by your purchase of such products or services. Additionally, you shall hold us blameless from any losses sustained by you or harm caused to you relating to or resulting in any way from any Third-Party Content or any contact with Third-Party Websites.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>12. Advertisers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    We allow advertisers to display their advertisements and other information in certain areas of the Services, such as sidebar advertisements or banner advertisements. We simply provide the space to place such advertisements, and we have no other relationship with advertisers.
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>No Endorsement:</strong> The presence of advertisements on our Services does not constitute an endorsement, authorization, or representation of our affiliation with any advertiser. We are not responsible for the content, accuracy, or opinions expressed in any advertisements.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>13. Services Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    We reserve the right, but not the obligation, to:
                  </p>

                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Monitor the Services for violations of these Legal Terms</li>
                    <li>Take appropriate legal action against anyone who, in our sole discretion, violates the law or these Legal Terms, including reporting such user to law enforcement authorities</li>
                    <li>In our sole discretion and without limitation, refuse, restrict access to, limit the availability of, or disable any of your Contributions or any portion thereof</li>
                    <li>Remove from the Services or otherwise disable all files and content that are excessive in size or burdensome to our systems</li>
                    <li>Otherwise manage the Services in a manner designed to protect our rights and property and to facilitate the proper functioning of the Services</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>14. Privacy Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    We care about data privacy and security. Please review our Privacy Policy. By using the Services, you agree to be bound by our Privacy Policy, which is incorporated into these Legal Terms.
                  </p>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      International Data Transfer
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      Please be advised the Services are hosted in the United States. If you access the Services from any other region of the world with laws or other requirements governing personal data collection, use, or disclosure that differ from applicable laws in the United States, then through your continued use of the Services, you are transferring your data to the United States, and you expressly consent to have your data transferred to and processed in the United States.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      Children's Privacy
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      We do not knowingly accept, request, or solicit information from children or knowingly market to children. In accordance with the U.S. Children's Online Privacy Protection Act, if we receive actual knowledge that anyone under the age of 13 has provided personal information to us without the requisite and verifiable parental consent, we will delete that information from the Services as quickly as is reasonably practical.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>15. Term and Termination</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    These Legal Terms shall remain in full force and effect while you use the Services.
                  </p>

                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                      Our Right to Terminate
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      <strong>WITHOUT LIMITING ANY OTHER PROVISION OF THESE LEGAL TERMS, WE RESERVE THE RIGHT TO, IN OUR SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO AND USE OF THE SERVICES (INCLUDING BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON OR FOR NO REASON, INCLUDING WITHOUT LIMITATION FOR BREACH OF ANY REPRESENTATION, WARRANTY, OR COVENANT CONTAINED IN THESE LEGAL TERMS OR OF ANY APPLICABLE LAW OR REGULATION.</strong>
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Termination Consequences</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>We may terminate your use or participation in the Services or delete your account and any content or information that you posted at any time, without warning, in our sole discretion</li>
                      <li>If we terminate or suspend your account for any reason, you are prohibited from registering and creating a new account under your name, a fake or borrowed name, or the name of any third party</li>
                      <li>In addition to terminating or suspending your account, we reserve the right to take appropriate legal action, including without limitation pursuing civil, criminal, and injunctive redress</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Post-Termination
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      Upon termination, your right to use the Services will cease immediately. If you wish to terminate your account, you may simply discontinue using the Services. All provisions of these Legal Terms which by their nature should survive termination shall survive termination.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>16. Modifications and Interruptions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Service Modifications</h4>
                    <p className="text-muted-foreground mb-2">
                      We reserve the right to change, modify, or remove the contents of the Services at any time or for any reason at our sole discretion without notice. However, we have no obligation to update any information on our Services.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Service Availability</h4>
                    <p className="text-muted-foreground mb-2">
                      We cannot guarantee the Services will be available at all times. We may experience hardware, software, or other problems or need to perform maintenance related to the Services, resulting in interruptions, delays, or errors.
                    </p>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      No Liability for Interruptions
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      You agree that we have no liability whatsoever for any loss, damage, or inconvenience caused by your inability to access or use the Services during any downtime or discontinuance of the Services. Nothing in these Legal Terms will be construed to obligate us to maintain and support the Services or to supply any corrections, updates, or releases in connection therewith.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>17. Governing Law</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    These Legal Terms and your use of the Services are governed by and construed in accordance with the laws of the State of Michigan applicable to agreements made and to be entirely performed within the State of Michigan, without regard to its conflict of law principles.
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>Jurisdiction:</strong> Any legal action or proceeding arising under these Legal Terms will be brought exclusively in the federal or state courts located in Oakland County, Michigan, and the parties hereby consent to personal jurisdiction and venue therein.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>18. Dispute Resolution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Informal Negotiations</h4>
                    <p className="text-muted-foreground mb-2">
                      To expedite resolution and control the cost of any dispute, controversy, or claim related to these Legal Terms (each a "Dispute" and collectively, the "Disputes") brought by either you or us, the Parties agree to first attempt to negotiate any Dispute informally for at least thirty (30) days before initiating arbitration.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Binding Arbitration</h4>
                    <p className="text-muted-foreground mb-2">
                      If the Parties are unable to resolve a Dispute through informal negotiations, the Dispute will be finally and exclusively resolved by binding arbitration. <strong>YOU UNDERSTAND THAT WITHOUT THIS PROVISION, YOU WOULD HAVE THE RIGHT TO SUE IN COURT AND HAVE A JURY TRIAL.</strong>
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Arbitration Rules</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>The arbitration shall be commenced and conducted under the Commercial Arbitration Rules of the American Arbitration Association ("AAA")</li>
                      <li>Where appropriate, the AAA's Supplementary Procedures for Consumer Related Disputes ("AAA Consumer Rules") will apply</li>
                      <li>Your arbitration fees and your share of arbitrator compensation shall be governed by the AAA Consumer Rules</li>
                      <li>The arbitration will take place in Oakland County, Michigan</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Court Proceedings</h4>
                    <p className="text-muted-foreground mb-2">
                      If for any reason, a Dispute proceeds in court rather than arbitration, the Dispute shall be commenced or prosecuted in the state and federal courts located in Oakland County, Michigan, and the Parties hereby consent to, and waive all defenses of lack of personal jurisdiction, and forum non conveniens with respect to venue and jurisdiction in such state and federal courts.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Restrictions</h4>
                    <p className="text-muted-foreground mb-2">
                      The Parties agree that any arbitration shall be limited to the Dispute between the Parties individually. To the full extent permitted by law:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>No arbitration shall be joined with any other proceeding</li>
                      <li>There is no right or authority for any Dispute to be arbitrated on a class-action basis or to utilize class action procedures</li>
                      <li>There is no right or authority for any Dispute to be brought in a purported representative capacity on behalf of the general public or any other persons</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Exceptions to Informal Negotiations and Arbitration</h4>
                    <p className="text-muted-foreground mb-2">
                      The following Disputes are not subject to the above provisions concerning informal negotiations and binding arbitration:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>Any Disputes seeking to enforce or protect, or concerning the validity of, any of the intellectual property rights of a Party</li>
                      <li>Any Dispute related to, or arising from, allegations of theft, piracy, invasion of privacy, or unauthorized use</li>
                      <li>Any claim for injunctive relief</li>
                    </ul>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                      Limitation Period
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      In no event shall any Dispute brought by either Party related in any way to the Services be commenced more than one (1) year after the cause of action arose. If this provision is found to be illegal or unenforceable, then neither Party will elect to arbitrate any Dispute falling within that portion found to be illegal or unenforceable.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>19. Corrections</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    There may be information on the Services that contains typographical errors, inaccuracies, or omissions, including descriptions, pricing, availability, and various other information. We reserve the right to correct any errors, inaccuracies, or omissions and to change or update the information on the Services at any time, without prior notice.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>20. Disclaimer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                      AS-IS BASIS
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      <strong>THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU AGREE THAT YOUR USE OF THE SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SERVICES AND YOUR USE THEREOF.</strong>
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">No Warranties</h4>
                    <p className="text-muted-foreground mb-2">
                      We make no warranties or representations about the accuracy or completeness of the Services' content or the content of any websites or mobile applications linked to the Services and we will assume no liability or responsibility for any:
                    </p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 text-sm">
                      <li>Errors, mistakes, or inaccuracies of content and materials</li>
                      <li>Personal injury or property damage, of any nature whatsoever, resulting from your access to and use of the Services</li>
                      <li>Any unauthorized access to or use of our secure servers and/or any and all personal information and/or financial information stored therein</li>
                      <li>Any interruption or cessation of transmission to or from the Services</li>
                      <li>Any bugs, viruses, Trojan horses, or the like which may be transmitted to or through the Services by any third party</li>
                      <li>Any errors or omissions in any content and materials or for any loss or damage of any kind incurred as a result of the use of any content posted, transmitted, or otherwise made available via the Services</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      <strong>Third-Party Disclaimer:</strong> We do not warrant, endorse, guarantee, or assume responsibility for any product or service advertised or offered by a third party through the Services, any hyperlinked website, or any website or mobile application featured in any banner or other advertising.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>21. Limitations of Liability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                      Liability Limitations
                    </h4>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                      <strong>IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</strong>
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Maximum Liability</h4>
                    <p className="text-muted-foreground mb-2">
                      Notwithstanding anything to the contrary contained herein, our liability to you for any cause whatsoever and regardless of the form of the action, will at all times be limited to the lesser of the amount paid, if any, by you to us during the one (1) month period prior to any cause of action arising or $5.00 USD.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>State Law Variations:</strong> Certain US state laws and international laws do not allow limitations on implied warranties or the exclusion or limitation of certain damages. If these laws apply to you, some or all of the above disclaimers or limitations may not apply to you, and you may have additional rights.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>22. Indemnification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys' fees and expenses, made by any third party due to or arising out of:
                  </p>

                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Your Contributions</li>
                    <li>Use of the Services</li>
                    <li>Breach of these Legal Terms</li>
                    <li>Any breach of your representations and warranties set forth in these Legal Terms</li>
                    <li>Your violation of the rights of a third party, including but not limited to intellectual property rights</li>
                    <li>Any overt harmful act toward any other user of the Services with whom you connected via the Services</li>
                  </ul>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      <strong>Our Defense Rights:</strong> Notwithstanding the foregoing, we reserve the right, at your expense, to assume the exclusive defense and control of any matter for which you are required to indemnify us, and you agree to cooperate, at your expense, with our defense of such claims.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>23. User Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    We will maintain certain data that you transmit to the Services for the purpose of managing the performance of the Services, as well as data relating to your use of the Services. Although we perform regular routine backups of data, you are solely responsible for all data that you transmit or that relates to any activity you have undertaken using the Services.
                  </p>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Data Responsibility
                    </h4>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      You agree that we shall have no liability to you for any loss or corruption of any such data, and you hereby waive any right of action against us arising from any such loss or corruption of such data.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>24. Electronic Communications, Transactions, and Signatures</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Visiting the Services, sending us emails, and completing online forms constitute electronic communications. You consent to receive electronic communications, and you agree that all agreements, notices, disclosures, and other communications we provide to you electronically, via email and on the Services, satisfy any legal requirement that such communication be in writing.
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      Electronic Signatures
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>YOU HEREBY AGREE TO THE USE OF ELECTRONIC SIGNATURES, CONTRACTS, ORDERS, AND OTHER RECORDS, AND TO ELECTRONIC DELIVERY OF NOTICES, POLICIES, AND RECORDS OF TRANSACTIONS INITIATED OR COMPLETED BY US OR VIA THE SERVICES.</strong> You hereby waive any rights or requirements under any statutes, regulations, rules, ordinances, or other laws in any jurisdiction which require an original signature or delivery or retention of non-electronic records.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>25. SMS Text Messaging</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Message Frequency</h4>
                    <p className="text-muted-foreground mb-2">
                      For MFA Security and Job Notifications
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Opting Out</h4>
                    <p className="text-muted-foreground mb-2">
                      If at any time you wish to stop receiving SMS messages from us, simply reply to the text with "STOP." You may receive an SMS message confirming your opt out.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Message and Data Rates</h4>
                    <p className="text-muted-foreground mb-2">
                      Please be aware that message and data rates may apply to any SMS messages sent or received. The rates are determined by your carrier and the specifics of your mobile plan.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      Support
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      If you have any questions or need assistance regarding our SMS communications, please email us at info@myvideoresu.me or call at (+1) 248 825 0176.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>26. California Users and Residents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    If any complaint with us is not satisfactorily resolved, you can contact the Complaint Assistance Unit of the Division of Consumer Services of the California Department of Consumer Affairs in writing at 1625 North Market Blvd., Suite N 112, Sacramento, California 95834 or by telephone at (800) 952-5210 or (916) 445-1254.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>27. Miscellaneous</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Entire Agreement</h4>
                    <p className="text-muted-foreground mb-2">
                      These Legal Terms and any policies or operating rules posted by us on the Services or in respect to the Services constitute the entire agreement and understanding between you and us.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Additional Terms</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 text-sm">
                      <li>Our failure to exercise or enforce any right or provision shall not operate as a waiver</li>
                      <li>These Legal Terms operate to the fullest extent permissible by law</li>
                      <li>We may assign any or all of our rights and obligations to others at any time</li>
                      <li>We shall not be responsible for any loss, damage, delay, or failure to act caused by any cause beyond our reasonable control</li>
                      <li>If any provision is determined to be unlawful, void, or unenforceable, that provision is deemed severable and does not affect the validity of remaining provisions</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Relationship</h4>
                    <p className="text-muted-foreground mb-2">
                      There is no joint venture, partnership, employment or agency relationship created between you and us as a result of these Legal Terms or use of the Services. You agree that these Legal Terms will not be construed against us by virtue of having drafted them.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      <strong>Electronic Form:</strong> You hereby waive any and all defenses you may have based on the electronic form of these Legal Terms and the lack of signing by the parties hereto to execute these Legal Terms.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>28. Contact Us</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    In order to resolve a complaint regarding the Services or to receive further information regarding use of the Services, please contact us at:
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium">Primary Contact</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <span>info@myvideoresu.me</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <span>MyVideoResu.ME c/o MyVideoResu.ME</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Company Details</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><strong>Company:</strong> MyVideoResu.ME</p>
                        <p><strong>Address:</strong> Troy, MI, United States</p>
                        <p><strong>Phone:</strong> (+1) 248 825 0176</p>
                        <p><strong>Email:</strong> info@myvideoresu.me</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Legal Notice:</strong> These terms are governed by the laws of the State of Michigan, United States. Any disputes will be resolved through binding arbitration in Oakland County, Michigan, subject to the dispute resolution procedures outlined in these Legal Terms.
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
