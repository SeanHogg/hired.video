"use client";

import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Mail,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  generateATSPackage,
  type ATSPackage,
} from "@/lib/services/studio-features-service";

// ---------------------------------------------------------------------------

interface ATSPackageGeneratorProps {
  projectId: string;
  scriptText: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  candidateName?: string;
  headline?: string;
  onPackageGenerated?: (pkg: { slug: string; pageUrl: string }) => void;
}

// ---------------------------------------------------------------------------

export default function ATSPackageGenerator({
  projectId,
  scriptText,
  videoUrl,
  thumbnailUrl,
  candidateName: initialName = "",
  headline: initialHeadline = "",
  onPackageGenerated,
}: ATSPackageGeneratorProps) {
  const { t } = useTranslation();
  // ── Form fields ──────────────────────────────────────────────────────────
  const [name, setName] = useState(initialName);
  const [headlineText, setHeadlineText] = useState(initialHeadline);
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // ── Generated package ────────────────────────────────────────────────────
  const [pkg, setPkg] = useState<ATSPackage | null>(null);
  const [textSummary, setTextSummary] = useState("");
  const [emailTemplate, setEmailTemplate] = useState("");

  // ── State ────────────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── Generate package ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!name.trim()) return;
    try {
      setGenerating(true);
      setError(null);
      const result = await generateATSPackage({
        projectId,
        candidateName: name.trim(),
        headline: headlineText.trim() || undefined,
        linkedinUrl: linkedinUrl.trim() || undefined,
        videoUrl,
        thumbnailUrl,
        scriptText,
      });
      setPkg(result);
      setTextSummary(result.textSummary);
      setEmailTemplate(result.emailTemplate);
      onPackageGenerated?.({ slug: result.slug, pageUrl: result.pageUrl });
    } catch {
      setError(t("studio.atsPackage.generateError"));
    } finally {
      setGenerating(false);
    }
  }, [
    name,
    headlineText,
    linkedinUrl,
    projectId,
    scriptText,
    videoUrl,
    thumbnailUrl,
    onPackageGenerated,
    t,
  ]);

  // ── Copy helper ──────────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback — ignore
    }
  };

  const CopyButton = ({
    text,
    field,
    label,
    icon: Icon,
  }: {
    text: string;
    field: string;
    label: string;
    icon: React.ElementType;
  }) => {
    const copied = copiedField === field;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => copyToClipboard(text, field)}
      >
        {copied ? (
          <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
        ) : (
          <Icon className="mr-1.5 h-3.5 w-3.5" />
        )}
        {copied ? t("labels.copiedExclaim") : label}
      </Button>
    );
  };

  const pageUrl = pkg ? `https://hired.video/v/${pkg.slug}` : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          {t("studio.atsPackage.heading")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Input form ────────────────────────────────────────────────── */}
        {!pkg && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ats-name">{t("studio.atsPackage.candidateNameLabel")}</Label>
              <Input
                id="ats-name"
                placeholder={t("studio.atsPackage.candidateNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ats-headline">{t("fields.headline.label")}</Label>
              <Input
                id="ats-headline"
                placeholder={t("studio.atsPackage.headlinePlaceholder")}
                value={headlineText}
                onChange={(e) => setHeadlineText(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ats-linkedin">{t("studio.atsPackage.linkedinUrlLabel")}</Label>
              <Input
                id="ats-linkedin"
                placeholder="https://linkedin.com/in/janedoe"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              disabled={!name.trim() || generating}
              onClick={handleGenerate}
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("studio.atsPackage.generating")}
                </>
              ) : (
                t("studio.atsPackage.generateAction")
              )}
            </Button>
          </div>
        )}

        {/* ── Generated output ──────────────────────────────────────────── */}
        {pkg && (
          <div className="space-y-6">
            {/* Shareable link */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("studio.atsPackage.shareableLink")}</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-mono truncate flex-1">
                  {pageUrl}
                </span>
                <CopyButton
                  text={pageUrl!}
                  field="link"
                  label={t("studio.atsPackage.copyLink")}
                  icon={Copy}
                />
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={pageUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Text summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ats-summary" className="text-sm font-medium">
                  {t("studio.atsPackage.textSummary")}
                </Label>
                <CopyButton
                  text={textSummary}
                  field="summary"
                  label={t("actions.copy")}
                  icon={Copy}
                />
              </div>
              <Textarea
                id="ats-summary"
                rows={6}
                value={textSummary}
                onChange={(e) => setTextSummary(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* Email template */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ats-email" className="text-sm font-medium">
                  {t("studio.atsPackage.emailTemplate")}
                </Label>
                <CopyButton
                  text={emailTemplate}
                  field="email"
                  label={t("studio.atsPackage.copyEmail")}
                  icon={Mail}
                />
              </div>
              <Textarea
                id="ats-email"
                rows={8}
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* Landing page preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("studio.atsPackage.landingPagePreview")}
              </Label>
              <div className="rounded-md border bg-muted/20 p-4">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  {/* Thumbnail */}
                  <div className="relative w-full max-w-[240px] aspect-video rounded-md bg-muted overflow-hidden flex-shrink-0">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={t("studio.atsPackage.thumbnailAlt")}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Eye className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                    <Badge
                      variant="secondary"
                      className="absolute bottom-2 right-2 text-[10px]"
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      {t("studio.element.video")}
                    </Badge>
                  </div>

                  {/* Info */}
                  <div className="flex-1 space-y-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">
                      {name}
                    </h3>
                    {headlineText && (
                      <p className="text-sm text-muted-foreground truncate">
                        {headlineText}
                      </p>
                    )}
                    {linkedinUrl && (
                      <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t("studio.atsPackage.linkedinProfile")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPkg(null);
                  setTextSummary("");
                  setEmailTemplate("");
                }}
              >
                {t("studio.atsPackage.regenerate")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
