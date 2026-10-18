/**
 * Warm-intro suggestions behind `GET /api/network/warm-intros` (#1678): the
 * caller's 1st- and 2nd-degree accepted connections at a target company.
 * The graph is walked in-memory over the caller's connection set, which is
 * bounded per user.
 */
import { findAcceptedConnectionUserIds, findAcceptedEdgesTouching } from "../../repositories/userConnectionsRepository.js";
import { findAtCompanyAmong, findNamesByIds, type CompanyPersonRow } from "../../repositories/usersProfileRepository.js";

export interface SecondDegreeIntro extends CompanyPersonRow {
  connectorId: string;
  connectorName: string;
}

export interface WarmIntros {
  company: string;
  firstDegree: CompanyPersonRow[];
  secondDegree: SecondDegreeIntro[];
}

export async function findWarmIntros(userId: string, company: string): Promise<WarmIntros> {
  const myConnIds = (await findAcceptedConnectionUserIds(userId)).filter((id) => id !== userId);
  if (myConnIds.length === 0) return { company, firstDegree: [], secondDegree: [] };
  const myConnSet = new Set(myConnIds);

  // 1st degree — my connections who work at the company.
  const firstDegree = await findAtCompanyAmong(myConnIds, company, 25);

  // 2nd degree — accepted connections of my connections, at the company, who
  // aren't me and aren't already 1st-degree. candidateId -> connectorId.
  const edges = await findAcceptedEdgesTouching(myConnIds);
  const candidateToConnector = new Map<string, string>();
  for (const e of edges) {
    const connector = myConnSet.has(e.from) ? e.from : myConnSet.has(e.to) ? e.to : null;
    if (!connector) continue;
    const candidate = connector === e.from ? e.to : e.from;
    if (candidate === userId || myConnSet.has(candidate)) continue;
    if (!candidateToConnector.has(candidate)) candidateToConnector.set(candidate, connector);
  }

  const candidateIds = [...candidateToConnector.keys()];
  if (candidateIds.length === 0) return { company, firstDegree, secondDegree: [] };

  const atCompany = await findAtCompanyAmong(candidateIds, company, 25);
  const connectorIds = [...new Set(atCompany.map((p) => candidateToConnector.get(p.userId)!).filter(Boolean))];
  const connectorNames = connectorIds.length > 0 ? await findNamesByIds(connectorIds) : new Map<string, string>();
  const secondDegree = atCompany.map((p) => {
    const connectorId = candidateToConnector.get(p.userId)!;
    return { ...p, connectorId, connectorName: connectorNames.get(connectorId) ?? "A connection" };
  });
  return { company, firstDegree, secondDegree };
}
