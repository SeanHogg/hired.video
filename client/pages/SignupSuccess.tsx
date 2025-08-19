import { Mail, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import Footer from '@/components/Footer';
import Navigation from '@/components/Navigation';
import Sidebar from '@/components/Sidebar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSidebar } from '@/hooks/use-sidebar';

export default function SignupSuccess() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || 'your email address';
  const firstName = searchParams.get('firstName') || '';
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

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
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-2xl">
                  Welcome{firstName ? ` ${firstName}` : ''}!
                </CardTitle>
                <CardDescription>
                  Your account has been created successfully
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Check your email to get started!</strong>
                    <br />
                    We've sent a confirmation email to <strong>{email}</strong>
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg bg-blue-50 p-4">
                  <div className="flex items-start">
                    <Mail className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">
                        Next Steps:
                      </p>
                      <ol className="text-sm text-blue-700 mt-1 space-y-1 list-decimal list-inside">
                        <li>Check your email inbox (and spam folder)</li>
                        <li>Click the confirmation link in the email</li>
                        <li>Sign in to start using your account</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-3">
                      Didn't receive the email?
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.reload()}
                        className="flex-1"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Resend Email
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        asChild
                        className="flex-1"
                      >
                        <Link to="/signup">
                          Try Different Email
                        </Link>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="text-center pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-2">
                      Already confirmed your email?
                    </p>
                    <Button asChild className="w-full">
                      <Link to="/login">
                        Sign In to Your Account
                      </Link>
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    <Link 
                      to="/" 
                      className="text-sm text-gray-600 hover:text-gray-500 inline-flex items-center"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Return to Home
                    </Link>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 text-center">
                    <strong>Having trouble?</strong> Contact our support team for assistance.
                    The confirmation link will expire in 24 hours.
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
