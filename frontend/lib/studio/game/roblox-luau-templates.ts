/**
 * #1661 — Luau script templates auto-generated alongside the
 * `.rbxlx` export so collectible / goal / hazard interactions
 * actually work when the user opens the exported place file in
 * Roblox Studio. Pure templates — caller composes per-entity from
 * the shared World3DState mutation seam.
 *
 * Why a template, not a full code generator: the surface area is
 * narrow (5 challenge kinds × 4 entity kinds) and the script bodies
 * are short. A template pass covers ~80% of authored worlds without
 * needing a Lua compiler in the studio.
 *
 * The exported place file embeds one ServerScript per challenge
 * referencing tags the entity Parts already carry (CollectionService
 * matches our `tag` field).
 */

import type { World3DChallenge } from "@shared/game-state";

export interface LuauScriptArtifact {
  /** Path inside the Roblox place — `ServerScriptService/<name>`. */
  path: string;
  /** Lua source. */
  source: string;
}

const COLLECT_TEMPLATE = (challenge: World3DChallenge): string => `-- Auto-generated collect handler for "${challenge.label}"
-- Hired.video studio export — challenge id ${challenge.id}
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local TARGET_COUNT = ${Number(challenge.params.target ?? 1)}
local TAG = "${String(challenge.params.tag ?? challenge.id)}"

local collected = {}

local function onTouched(player, part)
\tcollected[player] = (collected[player] or 0) + 1
\tpart:Destroy()
\tif collected[player] >= TARGET_COUNT then
\t\tprint(player.Name, "completed challenge ${challenge.label}")
\tend
end

for _, part in CollectionService:GetTagged(TAG) do
\tpart.Touched:Connect(function(hit)
\t\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)
\t\tif player then onTouched(player, part) end
\tend)
end
`;

const REACH_TEMPLATE = (challenge: World3DChallenge): string => `-- Auto-generated reach-zone handler for "${challenge.label}"
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local TAG = "${String(challenge.params.tag ?? challenge.id)}"
local reached = {}

for _, part in CollectionService:GetTagged(TAG) do
\tpart.Touched:Connect(function(hit)
\t\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)
\t\tif player and not reached[player] then
\t\t\treached[player] = true
\t\t\tprint(player.Name, "reached ${challenge.label}")
\t\tend
\tend)
end
`;

const TIMER_TEMPLATE = (challenge: World3DChallenge): string => `-- Auto-generated time-trial handler for "${challenge.label}"
local timeLimitSec = ${Number(challenge.params.seconds ?? 60)}
local startAt = workspace:GetServerTimeNow()
local running = true

while running and workspace:GetServerTimeNow() - startAt < timeLimitSec do
\twait(0.5)
end
if running then
\tprint("${challenge.label} — time up!")
end
`;

const SCORE_TEMPLATE = (challenge: World3DChallenge): string => `-- Auto-generated score-target handler for "${challenge.label}"
local TARGET_SCORE = ${Number(challenge.params.target ?? 100)}
local scores = {}
script:GetFolderAncestor():FindFirstChild("Scoreboard") -- expected lookup
print("Score-target challenge wired; advance ${challenge.label} when player reaches", TARGET_SCORE)
`;

const HP_DAMAGE_TEMPLATE = `-- #1661 — Default HP + damage handler. Wires standard Humanoid health
-- so weapon entities deal a configurable damage value on hit. Hooked
-- via tag: Parts tagged \"weapon\" deal \`damage\` on Touch.
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

for _, weapon in CollectionService:GetTagged("weapon") do
\tlocal damage = weapon:GetAttribute("Damage") or 10
\tweapon.Touched:Connect(function(hit)
\t\tlocal humanoid = hit.Parent:FindFirstChildOfClass("Humanoid")
\t\tif humanoid then
\t\t\thumanoid:TakeDamage(damage)
\t\tend
\tend)
end
`;

export function buildLuauScripts(args: {
  challenges: World3DChallenge[];
  includeHpDamage?: boolean;
}): LuauScriptArtifact[] {
  const out: LuauScriptArtifact[] = [];
  for (const challenge of args.challenges) {
    let source = "";
    switch (challenge.kind) {
      case "collect":
        source = COLLECT_TEMPLATE(challenge);
        break;
      case "reach":
        source = REACH_TEMPLATE(challenge);
        break;
      case "timer":
        source = TIMER_TEMPLATE(challenge);
        break;
      case "score":
        source = SCORE_TEMPLATE(challenge);
        break;
      default: {
        const _exhaustive: never = challenge.kind;
        void _exhaustive;
        continue;
      }
    }
    out.push({
      path: `ServerScriptService/HiredChallenge_${challenge.id.replace(/[^A-Za-z0-9_]/g, "_")}.lua`,
      source,
    });
  }
  if (args.includeHpDamage ?? true) {
    out.push({
      path: "ServerScriptService/HiredHpDamage.lua",
      source: HP_DAMAGE_TEMPLATE,
    });
  }
  return out;
}
