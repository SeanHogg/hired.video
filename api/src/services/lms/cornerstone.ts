/**
 * Cornerstone OnDemand connector — gap #200.
 *
 * Cornerstone accepts SCORM 1.2 + 2004 via the `/services/api/x/lo-import/v1`
 * endpoint. Tenant alias lives in `auth.metadata.corpName` (set at OAuth
 * connect-time from the tenant subdomain). The publish call POSTs the
 * package URL — Cornerstone pulls async, then finalises on
 * `/services/api/x/lo-import/v1/{id}/status`.
 *
 * Per-tenant rate limits: Cornerstone enforces 300 req/min/tenant on the
 * LO Import API. The publish loop in scheduled.ts dedupes pending rows
 * per connector before fanning out.
 */

import type { LmsConnectorAdapter, LmsPublishInput, LmsPublishResult, LmsAuth } from "./index.js";

export class CornerstoneAdapter implements LmsConnectorAdapter {
  provider = "cornerstone" as const;

  async publishCourse(args: LmsPublishInput, auth: LmsAuth): Promise<LmsPublishResult> {
    const corpName = String(auth.metadata.corpName ?? "");
    const endpoint = `${auth.baseUrl}/services/api/x/lo-import/v1`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
        "X-CSOD-Corp-Name": corpName,
      },
      body: JSON.stringify({
        external_id: args.externalId,
        title: args.title,
        description: args.description,
        package_url: args.scormPackageUrl,
        package_type: "scorm_2004_4th",
        category: args.category,
        tags: args.tags ?? [],
      }),
    });
    if (!res.ok) {
      throw new Error(`Cornerstone publish failed ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { id: string; launch_url?: string };
    return { remoteId: body.id, launchUrl: body.launch_url };
  }

  async checkStatus(remoteId: string, auth: LmsAuth): Promise<{ status: string; launchUrl?: string }> {
    const res = await fetch(
      `${auth.baseUrl}/services/api/x/lo-import/v1/${encodeURIComponent(remoteId)}/status`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    if (!res.ok) throw new Error(`Cornerstone status ${res.status}`);
    return (await res.json()) as { status: string; launchUrl?: string };
  }

  async revokeCourse(remoteId: string, auth: LmsAuth): Promise<void> {
    const res = await fetch(
      `${auth.baseUrl}/services/api/x/lo-import/v1/${encodeURIComponent(remoteId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Cornerstone revoke failed ${res.status}`);
    }
  }
}
