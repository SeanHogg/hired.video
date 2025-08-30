import React, { useEffect } from 'react';
import { 
  Building2, 
  Users, 
  Heart, 
  Zap, 
  Globe, 
  Award,
  Coffee,
  Gamepad2,
  GraduationCap,
  Plane
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompanyCareersControl } from '@/components/careers/CompanyCareersControl';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

export default function Careers() {
  useEffect(() => {
    document.title = 'Careers - Join Our Team | MyVideoResu.me';

    // Set meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Join MyVideoResu.me and help revolutionize how people showcase their talents. Explore our open positions and become part of our innovative team.');
    }
  }, []);

  return (
    <>

      <div className="min-h-screen bg-background">
        <Navigation />
        
        <main className="container mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-brand-purple/10 text-brand-purple px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Building2 className="h-4 w-4" />
              We're Hiring!
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Join Our Mission to{' '}
              <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                Revolutionize Careers
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              At MyVideoResu.me, we're building the future of how people showcase their talents and find their dream jobs. 
              Join our passionate team and help millions of job seekers stand out from the crowd.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild>
                <a href="#open-positions">View Open Positions</a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#company-culture">Learn About Our Culture</a>
              </Button>
            </div>
          </div>

          {/* Company Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-brand-purple mb-2">50+</div>
                <div className="text-sm text-muted-foreground">Team Members</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-brand-blue mb-2">100K+</div>
                <div className="text-sm text-muted-foreground">Users Helped</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-brand-purple mb-2">15+</div>
                <div className="text-sm text-muted-foreground">Countries</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-brand-blue mb-2">95%</div>
                <div className="text-sm text-muted-foreground">Employee Satisfaction</div>
              </CardContent>
            </Card>
          </div>

          {/* Why Work With Us */}
          <section id="company-culture" className="mb-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Why Work With Us?</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                We believe in creating an environment where innovation thrives and every team member can make a meaningful impact.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-purple/10 rounded-lg">
                      <Zap className="h-6 w-6 text-brand-purple" />
                    </div>
                    <CardTitle className="text-lg">Innovation First</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Work with cutting-edge technologies including AI, machine learning, and video processing to solve real-world problems.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-blue/10 rounded-lg">
                      <Globe className="h-6 w-6 text-brand-blue" />
                    </div>
                    <CardTitle className="text-lg">Remote-First</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Work from anywhere in the world. We're a distributed team that values flexibility and work-life balance.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <GraduationCap className="h-6 w-6 text-green-600" />
                    </div>
                    <CardTitle className="text-lg">Growth & Learning</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Continuous learning budget, conference attendance, and mentorship programs to help you grow your career.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Heart className="h-6 w-6 text-purple-600" />
                    </div>
                    <CardTitle className="text-lg">Health & Wellness</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Comprehensive health insurance, mental health support, and wellness stipends for gym memberships.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Plane className="h-6 w-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-lg">Time Off</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Unlimited PTO policy, company-wide breaks, and sabbatical opportunities for long-term employees.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Award className="h-6 w-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-lg">Equity & Impact</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Competitive equity packages and the opportunity to make a real impact on millions of job seekers worldwide.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Perks & Benefits */}
          <section className="mb-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Perks & Benefits</h2>
              <p className="text-lg text-muted-foreground">
                We take care of our team so they can focus on doing their best work.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Coffee className="h-5 w-5 text-brand-purple" />
                <span className="text-sm font-medium">Free coffee & snacks</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Gamepad2 className="h-5 w-5 text-brand-blue" />
                <span className="text-sm font-medium">Game room & activities</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">Team building events</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Building2 className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-medium">Modern office spaces</span>
              </div>
            </div>
          </section>

          {/* Open Positions */}
          <section id="open-positions">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Open Positions</h2>
              <p className="text-lg text-muted-foreground">
                Ready to make an impact? Check out our current openings and find your perfect role.
              </p>
            </div>

            <CompanyCareersControl
              companyId="myvideoresume-company"
              showCompanyHeader={false}
              showFilters={true}
              showSearch={true}
              viewMode="table"
              className="mb-12"
            />
          </section>

          {/* Application Process */}
          <section className="mb-12">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Our Hiring Process</CardTitle>
                <CardDescription>
                  We believe in a transparent and efficient hiring process that respects your time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-brand-purple/10 text-brand-purple rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                      1
                    </div>
                    <h3 className="font-semibold mb-2">Application</h3>
                    <p className="text-sm text-muted-foreground">
                      Submit your application with your resume and cover letter.
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                      2
                    </div>
                    <h3 className="font-semibold mb-2">Phone Screen</h3>
                    <p className="text-sm text-muted-foreground">
                      Brief call with our recruiting team to discuss your background.
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                      3
                    </div>
                    <h3 className="font-semibold mb-2">Technical Interview</h3>
                    <p className="text-sm text-muted-foreground">
                      Technical discussion and problem-solving with the team.
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                      4
                    </div>
                    <h3 className="font-semibold mb-2">Final Interview</h3>
                    <p className="text-sm text-muted-foreground">
                      Meet with leadership and discuss culture fit and vision.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Call to Action */}
          <section className="text-center">
            <Card className="bg-gradient-to-r from-brand-purple/5 to-brand-blue/5 border-brand-purple/20">
              <CardContent className="pt-8 pb-8">
                <h2 className="text-2xl font-bold mb-4">Don't See the Perfect Role?</h2>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  We're always looking for talented individuals who share our passion for innovation. 
                  Send us your resume and let us know how you'd like to contribute to our mission.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild>
                    <a href="mailto:careers@myvideoresume.com">Send Us Your Resume</a>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <a href="/contact">Get in Touch</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
