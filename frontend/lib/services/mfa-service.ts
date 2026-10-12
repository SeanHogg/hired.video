/**
 * MFA service — single source of truth for TOTP + backup-code FE
 * operations. Both the MFA-challenge UI (login flow) and the
 * Security Settings panel call through here.
 */

import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const TotpSetupSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});

const TotpConfirmSchema = z.object({
  enabled: z.boolean(),
  backupCodes: z.array(z.string()),
});

const BackupCountSchema = z.object({ remaining: z.number() });
const BackupCodesSchema = z.object({ codes: z.array(z.string()) });

const EmailChangeRequestSchema = z.object({ requested: z.boolean() });

export const mfaService = {
  async beginTotpSetup() {
    const res = await apiClient.post("/api/security/totp/setup", {}, TotpSetupSchema);
    return res.data;
  },
  async confirmTotpSetup(code: string) {
    const res = await apiClient.post("/api/security/totp/confirm", { code }, TotpConfirmSchema);
    return res.data;
  },
  async disableTotp(code: string) {
    await apiClient.post("/api/security/totp/disable", { code });
  },
  async backupCodeCount() {
    const res = await apiClient.get("/api/security/backup-codes/count", BackupCountSchema);
    return res.data.remaining;
  },
  async regenerateBackupCodes() {
    const res = await apiClient.post("/api/security/backup-codes/regenerate", {}, BackupCodesSchema);
    return res.data.codes;
  },
  async requestEmailChange(newEmail: string) {
    await apiClient.post("/api/auth/email-change/request", { newEmail }, EmailChangeRequestSchema);
  },
};
