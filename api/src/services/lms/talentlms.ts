/**
 * TalentLMS connector — gap #200.
 *
 * TalentLMS uses a Basic-auth-with-API-key scheme (the "OAuth token"
 * field on the connector row is actually the API key for simplicity).
 * Course create is POST `/api/v1/courses`, SCORM upload is POST
 * `/api/v1/uploadcoursescormifile/course_id:<id>` with a public package
 * URL.
 *
 * Tenant subdomain lives in `auth.baseUrl` (e.g.
 * `https://acme.talentlms.com`).
 */

import type { LmsConnectorAdapter, LmsPublishInput, LmsPublishResult, LmsAuth } from "./index.js";

function basicAuth(apiKey: string): string {
  // TalentLMS expects "Basic base64(<apiKey>:)". Encoded literal at runtime.
  const raw = `${apiKey}:`;
  return `Basic ${btoa(raw)}`;
}

export class TalentLmsAdapter implements LmsConnectorAdapter {
  provider = "talentlms" as const;

  async publishCourse(args: LmsPublishInput, auth: LmsAuth): Promise<LmsPublishResult> {
    const headers = { Authorization: basicAuth(auth.accessToken), "Content-Type": "application/json" };
    const createRes = await fetch(`${auth.baseUrl}/api/v1/courses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: args.title,
        description: args.description ?? "",
        code: args.externalId,
        category_id: args.category,
      }),
    });
    if (!createRes.ok) throw new Error(`TalentLMS create ${createRes.status}: ${await createRes.text()}`);
    const created = (await createRes.json()) as { id: number };
    const courseId = String(created.id);

    const pkgRes = await fetch(
      `${auth.baseUrl}/api/v1/uploadcoursescormifile/course_id:${courseId}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ package_url: args.scormPackageUrl }),
      },
    );
    if (!pkgRes.ok) throw new Error(`TalentLMS scorm upload ${pkgRes.status}`);

    return {
      remoteId: courseId,
      launchUrl: `${auth.baseUrl}/learner/coursegoto/${courseId}`,
    };
  }

  async checkStatus(remoteId: string, auth: LmsAuth): Promise<{ status: string; launchUrl?: string }> {
    const res = await fetch(`${auth.baseUrl}/api/v1/courses/id:${remoteId}`, {
      headers: { Authorization: basicAuth(auth.accessToken) },
    });
    if (!res.ok) throw new Error(`TalentLMS status ${res.status}`);
    const body = (await res.json()) as { status?: string };
    return { status: body.status ?? "active", launchUrl: `${auth.baseUrl}/learner/coursegoto/${remoteId}` };
  }

  async revokeCourse(remoteId: string, auth: LmsAuth): Promise<void> {
    const res = await fetch(`${auth.baseUrl}/api/v1/deletecourse`, {
      method: "POST",
      headers: { Authorization: basicAuth(auth.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: remoteId, deleted_by_user_id: "0" }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`TalentLMS revoke ${res.status}`);
  }
}
