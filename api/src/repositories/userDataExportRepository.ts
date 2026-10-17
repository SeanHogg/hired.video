/**
 * UserDataExportRepository — the user-scoped reads behind the GDPR Art. 20 /
 * CPRA portability export (GET /api/settings/export). Every query is filtered
 * by the owner's userId; failures surface to the caller unchanged.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "./index.js";

export async function loadUserDataExportRows(userId: string) {
  const db = getDb();
  const repos = buildRepos(db);

  const [user] = await db
    .select({
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
      deletedAt: schema.users.deletedAt,
      doNotShare: schema.users.doNotShare,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const [profile] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))
    .limit(1);

  // Resume-table reads route through ResumeRepository (layering rule); the
  // export only needs id/title/status/createdAt.
  const resumes = (await repos.resumes.findAllForOwner(userId)).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.createdAt,
  }));

  const [
    applications,
    savedJobs,
    messages,
    videos,
    studioProjects,
    invoices,
    paymentMethods,
    [cookiePrefsRow],
    [privacyPrefsRow],
    [accountPrefsRow],
  ] = await Promise.all([
    db.select().from(schema.jobApplications).where(eq(schema.jobApplications.userId, userId)),
    db.select().from(schema.savedJobs).where(eq(schema.savedJobs.userId, userId)),
    db
      .select({
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        content: schema.messages.content,
        contentType: schema.messages.contentType,
        isEdited: schema.messages.isEdited,
        isDeleted: schema.messages.isDeleted,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(eq(schema.messages.senderId, userId)),
    db
      .select({
        id: schema.videos.id,
        title: schema.videos.title,
        description: schema.videos.description,
        privacyStatus: schema.videos.privacyStatus,
        status: schema.videos.status,
        r2Key: schema.videos.r2Key,
        youtubeUrl: schema.videos.youtubeUrl,
        duration: schema.videos.duration,
        createdAt: schema.videos.createdAt,
      })
      .from(schema.videos)
      .where(eq(schema.videos.userId, userId)),
    db
      .select({
        id: schema.studioProjects.id,
        kind: schema.studioProjects.kind,
        mediaKind: schema.studioProjects.mediaKind,
        createdAt: schema.studioProjects.createdAt,
      })
      .from(schema.studioProjects)
      .where(eq(schema.studioProjects.userId, userId)),
    db
      .select({
        id: schema.invoices.id,
        status: schema.invoices.status,
        total: schema.invoices.total,
        currency: schema.invoices.currency,
        paidAt: schema.invoices.paidAt,
        invoicePdfUrl: schema.invoices.invoicePdfUrl,
        createdAt: schema.invoices.createdAt,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.userId, userId)),
    db
      .select({
        id: schema.paymentMethods.id,
        last4: schema.paymentMethods.last4,
        brand: schema.paymentMethods.brand,
        expiryMonth: schema.paymentMethods.expiryMonth,
        expiryYear: schema.paymentMethods.expiryYear,
        isDefault: schema.paymentMethods.isDefault,
        createdAt: schema.paymentMethods.createdAt,
      })
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.userId, userId)),
    db.select().from(schema.cookiePreferences).where(eq(schema.cookiePreferences.userId, userId)).limit(1),
    db.select().from(schema.privacyPreferences).where(eq(schema.privacyPreferences.userId, userId)).limit(1),
    db.select().from(schema.accountPreferences).where(eq(schema.accountPreferences.userId, userId)).limit(1),
  ]);

  return {
    user: user ?? null,
    profile: profile ?? null,
    resumes,
    applications,
    savedJobs,
    messages,
    videos,
    studioProjects,
    invoices,
    paymentMethods,
    cookiePrefsRow: cookiePrefsRow ?? null,
    privacyPrefsRow: privacyPrefsRow ?? null,
    accountPrefsRow: accountPrefsRow ?? null,
  };
}
