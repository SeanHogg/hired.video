/**
 * Docebo connector — gap #200.
 *
 * Docebo accepts SCORM via the `/learn/v1/courses` create flow + a
 * separate `/learn/v1/le_packages` upload step. The simplest path is to
 * POST the course with `course_type=elearning` then push the package URL.
 * OAuth 2.0; tenant base URL is `https://<subdomain>.docebosaas.com`.
 */

import type { LmsConnectorAdapter, LmsPublishInput, LmsPublishResult, LmsAuth } from "./index.js";

export class DoceboAdapter implements LmsConnectorAdapter {
  provider = "docebo" as const;

  async publishCourse(args: LmsPublishInput, auth: LmsAuth): Promise<LmsPublishResult> {
    const createRes = await fetch(`${auth.baseUrl}/learn/v1/courses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: args.externalId,
        name: args.title,
        description: args.description,
        course_type: "elearning",
        category_id: args.category,
        tags: args.tags ?? [],
      }),
    });
    if (!createRes.ok) {
      throw new Error(`Docebo create ${createRes.status}: ${await createRes.text()}`);
    }
    const created = (await createRes.json()) as { data: { id: string } };
    const courseId = created.data.id;

    const pkgRes = await fetch(`${auth.baseUrl}/learn/v1/courses/${courseId}/le_packages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ package_url: args.scormPackageUrl, type: "scorm" }),
    });
    if (!pkgRes.ok) throw new Error(`Docebo package upload ${pkgRes.status}`);

    return {
      remoteId: courseId,
      launchUrl: `${auth.baseUrl}/learn/course/${courseId}`,
    };
  }

  async checkStatus(remoteId: string, auth: LmsAuth): Promise<{ status: string; launchUrl?: string }> {
    const res = await fetch(`${auth.baseUrl}/learn/v1/courses/${remoteId}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok) throw new Error(`Docebo status ${res.status}`);
    const body = (await res.json()) as { data: { status: string } };
    return { status: body.data.status, launchUrl: `${auth.baseUrl}/learn/course/${remoteId}` };
  }

  async revokeCourse(remoteId: string, auth: LmsAuth): Promise<void> {
    const res = await fetch(`${auth.baseUrl}/learn/v1/courses/${remoteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Docebo revoke ${res.status}`);
  }
}
