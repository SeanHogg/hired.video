/**
 * Workday Learning connector — gap #200.
 *
 * Workday Learning ingests SCORM via the `wql/v1/data` write API.
 * Auth is the standard Workday API tenant alias + OAuth 2.0 token. The
 * SCORM package is uploaded via signed-url callout; Workday confirms
 * registration via webhook + a status poll on
 * `learningContent/{remoteId}`.
 *
 * Tenant alias lives in `auth.metadata.tenantAlias`.
 */

import type { LmsConnectorAdapter, LmsPublishInput, LmsPublishResult, LmsAuth } from "./index.js";

export class WorkdayLearningAdapter implements LmsConnectorAdapter {
  provider = "workday_learning" as const;

  async publishCourse(args: LmsPublishInput, auth: LmsAuth): Promise<LmsPublishResult> {
    const tenant = String(auth.metadata.tenantAlias ?? "");
    const res = await fetch(`${auth.baseUrl}/wql/v1/data/${tenant}/learningContent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        externalId: args.externalId,
        title: args.title,
        description: args.description,
        contentSource: { type: "SCORM_PACKAGE_URL", value: args.scormPackageUrl },
        categories: args.category ? [args.category] : [],
        tags: args.tags ?? [],
      }),
    });
    if (!res.ok) throw new Error(`Workday publish ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { id: string; launchUrl?: string };
    return { remoteId: body.id, launchUrl: body.launchUrl };
  }

  async checkStatus(remoteId: string, auth: LmsAuth): Promise<{ status: string; launchUrl?: string }> {
    const res = await fetch(`${auth.baseUrl}/wql/v1/data/learningContent/${remoteId}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok) throw new Error(`Workday status ${res.status}`);
    return (await res.json()) as { status: string; launchUrl?: string };
  }

  async revokeCourse(remoteId: string, auth: LmsAuth): Promise<void> {
    const res = await fetch(`${auth.baseUrl}/wql/v1/data/learningContent/${remoteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Workday revoke ${res.status}`);
  }
}
