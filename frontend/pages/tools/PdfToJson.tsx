import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Upload,
  Download,
  Code,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

export default function PdfToJson() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  // SEO for PDF to JSON page
  useSEO(location.pathname);

  const [file, setFile] = useState<File | null>(null);
  const [jsonResult, setJsonResult] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        setError("Please upload a PDF or Word document.");
        return;
      }

      // Validate file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("File size must be less than 10MB.");
        return;
      }

      setFile(selectedFile);
      setError(null);
      setJsonResult(null);
    }
  };

  const handleConversion = async () => {
    if (!file) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsConverting(true);
    setError(null);
    setJsonResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use the resume parse endpoint to convert to JSON
      const { data: result } = await apiClient.requestRaw<any>(
        "/api/resume/parse",
        { method: "POST", body: formData },
      );

      // Format the JSON result nicely
      const formattedJson =
        typeof result.result === "string"
          ? result.result
          : JSON.stringify(result.result, null, 2);

      setJsonResult(formattedJson);
    } catch (err) {
      console.error("Conversion failed:", err);
      setError("Failed to convert document. Please try again.");
    } finally {
      setIsConverting(false);
    }
  };

  const downloadJson = () => {
    if (!jsonResult) return;

    const blob = new Blob([jsonResult], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "resume"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    if (jsonResult) {
      navigator.clipboard.writeText(jsonResult);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setJsonResult(null);
  };

  const resetConverter = () => {
    setFile(null);
    setError(null);
    setJsonResult(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word")) return "📝";
    return "📄";
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

        <div className={`pt-16 ${showAuthOverlay ? "relative" : ""}`}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="resume"
              title="Document Converter Tool"
              message="Sign in to access our document conversion tool and convert your PDF/Word resumes to structured JSON format."
            />
          )}

          <div className="max-w-6xl mx-auto p-6">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <Link to="/tools">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tools
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-brand-orange/10 rounded-lg flex items-center justify-center">
                  <Code className="h-6 w-6 text-brand-orange" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Document Converter</h1>
                  <p className="text-muted-foreground">
                    Convert PDF and Word documents to structured JSON format
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-orange-100 text-orange-800"
                >
                  Beta
                </Badge>
              </div>

              {/* Info Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-1">
                        How it works
                      </h3>
                      <p className="text-sm text-blue-800">
                        Our AI-powered converter extracts text and structure
                        from your documents and converts them into JSON Resume
                        format, making them compatible with modern resume
                        builders and ATS systems.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Upload Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload Document
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Select File to Convert
                      </label>
                      <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                        <input
                          type="file"
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          id="document-upload"
                        />
                        <label
                          htmlFor="document-upload"
                          className="cursor-pointer"
                        >
                          <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                          <p className="text-lg font-medium mb-2">
                            Click to upload or drag and drop
                          </p>
                          <p className="text-sm text-muted-foreground">
                            PDF or Word documents (max 10MB)
                          </p>
                        </label>
                      </div>
                    </div>

                    {file && (
                      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getFileIcon(file)}</span>
                          <div>
                            <p className="font-medium">{file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={removeFile}>
                          Remove
                        </Button>
                      </div>
                    )}

                    <Button
                      onClick={handleConversion}
                      disabled={isConverting || !file}
                      className="w-full"
                      size="lg"
                    >
                      {isConverting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <Code className="h-4 w-4 mr-2" />
                          Convert to JSON
                        </>
                      )}
                    </Button>

                    {error && (
                      <Alert>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Supported Formats */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Supported Formats</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📄</span>
                        <div>
                          <p className="font-medium">PDF Documents</p>
                          <p className="text-sm text-muted-foreground">
                            Standard PDF files with text content
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📝</span>
                        <div>
                          <p className="font-medium">Word Documents</p>
                          <p className="text-sm text-muted-foreground">
                            .doc and .docx files
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {jsonResult && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Code className="h-5 w-5" />
                          JSON Result
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={copyToClipboard}
                          >
                            Copy
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadJson}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted rounded-lg p-4 max-h-96 overflow-auto">
                        <pre className="text-sm whitespace-pre-wrap font-mono">
                          {jsonResult}
                        </pre>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" onClick={resetConverter}>
                          Convert Another
                        </Button>
                        <Button
                          onClick={() => {
                            // Create a resume from this JSON
                            const blob = new Blob([jsonResult], {
                              type: "application/json",
                            });
                            const file = new File([blob], "resume.json", {
                              type: "application/json",
                            });

                            // Navigate to resume creation with this file
                            const formData = new FormData();
                            formData.append("file", file);

                            // This would typically redirect to resume builder
                            window.location.href = "/resumes/builder/new";
                          }}
                        >
                          Create Resume from JSON
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!jsonResult && !isConverting && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Code className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Ready to Convert</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Upload a PDF or Word document to convert it to
                        structured JSON format.
                      </p>

                      <div className="text-left bg-muted rounded-lg p-4 mt-4">
                        <h4 className="font-medium mb-2">What you'll get:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Structured JSON Resume format</li>
                          <li>• Compatible with modern resume builders</li>
                          <li>• ATS-friendly data structure</li>
                          <li>• Easy to edit and customize</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}
