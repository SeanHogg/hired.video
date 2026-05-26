/**
 * SAP SuccessFactors Learning connector — gap #200.
 *
 * SuccessFactors LMS exposes an OData v2 API
 * (`/learning/odatav4/public/admin/searchStudent/v1`) and a SCORM admin
 * endpoint `learning/odatav4/learningPlan/v1/Items`. Auth is OAuth 2.0
 * (SAML bearer assertion flow); for our purposes we receive a refresh
 * token at connect time and exchange.
 *
 * Tenant company id lives in `auth.metadata.companyId`.
 */

import type { LmsConnectorAdapter, LmsPublishInput, LmsPublishResult, LmsAuth } from "./index.js";

export class SuccessFactorsAdapter implements LmsConnectorAdapter {
  provider = "successfactors" as const;

  async publishCourse(args: LmsPublishInput, auth: LmsAuth): Promise<LmsPublishResult> {
    const companyId = String(auth.metadata.companyId ?? "");
    const res = await fetch(`${auth.baseUrl}/learning/odatav4/learningPlan/v1/Items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
        "X-SF-CompanyId": companyId,
      },
      body: JSON.stringify({
        itemId: args.externalId,
        itemType: "COURSE",
        title: args.title,
        description: args.description,
        contentPackage: { packageUrl: args.scormPackageUrl, type: "SCORM_2004" },
        keywords: args.tags ?? [],
      }),
    });
    if (!res.ok) throw new Error(`SuccessFactors publish ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { itemId: string; launchUrl?: string };
    return { remoteId: body.itemId, launchUrl: body.launchUrl };
  }

  async checkStatus(remoteId: string, auth: LmsAuth): Promise<{ status: string; launchUrl?: string }> {
    const res = await fetch(`${auth.baseUrl}/learning/odatav4/learningPlan/v1/Items('${remoteId}')`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok) throw new Error(`SuccessFactors status ${res.status}`);
    return (await res.json()) as { status: string; launchUrl?: string };
  }

  async revokeCourse(remoteId: string, auth: LmsAuth): Promise<void> {
    const res = await fetch(`${auth.baseUrl}/learning/odatav4/learningPlan/v1/Items('${remoteId}')`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`SuccessFactors revoke ${res.status}`);
  }
}
