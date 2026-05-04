import { useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  Upload,
  Download,
  Code,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/Footer";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { extractTextFromFile } from "@/lib/extract-text";
import { ToolPageHeader } from "@/components/tools/ToolPageHeader";

export default function PdfToJson() {
  const { t } = useTranslation();
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
  useBreadcrumbs([
    { name: t("labels.aiTools"), url: "/tools" },
    { name: t("tools.pdfToJson.title"), url: "/tools/pdf-to-json" },
  ]);

  const [file, setFile] = useState<File | null>(null);
  const [jsonResult, setJsonResult] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // File objects can't be serialized, but we flag that the user was mid-
  // conversion so the UI can prompt them to re-upload after login instead
  // of silently dropping them on the empty state.
  const { restored, snapshot, clear } = usePendingToolInput<{ pending?: boolean; fileName?: string }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.pending && !file) {
      setError(
        restored.fileName
          ? t("messages.reuploadFileToContinue", { fileName: restored.fileName })
          : t("messages.reuploadPdfToFinish"),
      );
    }
  }, [restored, isAuthenticated, file]);

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
        setError(t("errors.uploadPdfOrWord"));
        return;
      }

      // Validate file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError(t("errors.fileSizeMax10Mb"));
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
      snapshot({ pending: true, fileName: file.name });
      setShowAuthOverlay(true);
      return;
    }

    setIsConverting(true);
    setError(null);
    setJsonResult(null);

    try {
      // Extract text client-side using pdfjs-dist (much more reliable than
      // the server-side regex-based PDF parser)
      const text = await extractTextFromFile(file);
      if (!text.trim()) {
        setError(t("errors.couldNotExtractTextScanned"));
        setIsConverting(false);
        return;
      }

      // Send extracted text to the parse endpoint for AI-powered structuring
      const { data: result } = await apiClient.requestRaw<any>(
        "/api/resume/parse",
        {
          method: "POST",
          body: JSON.stringify({ content: text }),
          headers: { "Content-Type": "application/json" },
        },
      );

      // Format the JSON result nicely
      const raw = typeof result.result === "string" ? result.result : JSON.stringify(result.result, null, 2);
      // Pretty-print if it's valid JSON
      let formattedJson: string;
      try {
        formattedJson = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        formattedJson = raw;
      }

      setJsonResult(formattedJson);
      clear();
    } catch (err) {
      console.error("Conversion failed:", err);
      setError(t("errors.convertDocumentFailed"));
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
              contentType="tool"
              title={t("tools.pdfToJson.title")}
              message={t("messages.signInToRunTool")}
            />
          )}

          <div className="max-w-6xl mx-auto p-6">
            <ToolPageHeader
              toolId="pdf-to-json"
              icon={<Code className="h-6 w-6 text-brand-orange" />}
              iconBgClassName="bg-brand-orange/10"
              title={t("tools.pdfToJson.title")}
              description={t("tools.pdfToJson.subtitle")}
              titleExtras={
                <Badge
                  variant="secondary"
                  className="bg-orange-100 text-orange-800"
                >
                  {t("labels.beta")}
                </Badge>
              }
            />

            <div className="mb-8">
              {/* Info Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-1">
                        {t("headings.howItWorks")}
                      </h3>
                      <p className="text-sm text-blue-800">
                        {t("tools.pdfToJson.howItWorksBody")}
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
                      {t("headings.uploadDocument")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("labels.selectFileToConvert")}
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
                            {t("messages.clickOrDragAndDrop")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("messages.pdfOrWordMax10Mb")}
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
                          {t("actions.remove")}
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
                          {t("status.converting")}
                        </>
                      ) : (
                        <>
                          <Code className="h-4 w-4 mr-2" />
                          {t("actions.convertToJson")}
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
                    <CardTitle className="text-lg">{t("headings.supportedFormats")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📄</span>
                        <div>
                          <p className="font-medium">{t("labels.pdfDocuments")}</p>
                          <p className="text-sm text-muted-foreground">
                            {t("messages.pdfDocumentsDesc")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📝</span>
                        <div>
                          <p className="font-medium">{t("labels.wordDocuments")}</p>
                          <p className="text-sm text-muted-foreground">
                            {t("messages.wordDocumentsDesc")}
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
                          {t("headings.jsonResult")}
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={copyToClipboard}
                          >
                            {t("actions.copy")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadJson}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            {t("actions.download")}
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
                          {t("actions.convertAnother")}
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
                          {t("actions.createResumeFromJson")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!jsonResult && !isConverting && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Code className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">{t("headings.readyToConvert")}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t("messages.readyToConvertBody")}
                      </p>

                      <div className="text-left bg-muted rounded-lg p-4 mt-4">
                        <h4 className="font-medium mb-2">{t("headings.whatYoullGet")}</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• {t("tools.pdfToJson.feature1")}</li>
                          <li>• {t("tools.pdfToJson.feature2")}</li>
                          <li>• {t("tools.pdfToJson.feature3")}</li>
                          <li>• {t("tools.pdfToJson.feature4")}</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          <ToolFooterSEO />
          <Footer />
        </div>
      </div>
    </div>
  );
}
