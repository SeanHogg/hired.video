/**
 * The ONE deterministic explicit-term lexicon — swearing, slurs, sexual,
 * weapon, violence and drug terms — shared by every text gate:
 *
 *   • the explicit scan (api/src/services/moderation/explicit/textScan.ts)
 *   • the article content scan (contentScan.ts — profanity + slur floor)
 *   • the generation prompt guard (promptGuard.ts — the slur list)
 *
 * Pure and isomorphic (no network). Built to keep career copy clean of false
 * positives:
 *   • whole-word matching (Unicode-aware): "Scunthorpe", "assessment",
 *     "cocktail", "shiitake", "Wankel" don't match;
 *   • terms that collide with ordinary career language are left out on
 *     purpose ("shoot", "bullet", "explosive", "kill", "dick", bare "sex",
 *     "weed", "nude", "gore") — the LLM classifier judges those in context;
 *   • known idioms are stripped before matching ("nail gun", "jump the gun",
 *     "smoking gun", "magna cum laude", "cum dividend");
 *   • common evasions still match: masked letters ("f*ck", "f**k", "sh*t",
 *     "a**hole") and leetspeak ("p0rn", "sh1t", "n1gger").
 *
 * `matched` terms are canonical words for SERVER logs / SuperAdmin review —
 * never echo them to the person who wrote the text.
 */
import type { ExplicitCategory } from "./explicit.js";

interface LexiconEntry {
  /** Canonical term reported on a match. */
  term: string;
  category: ExplicitCategory;
  /** Regex source for the word (boundaries are added). Defaults to the
   *  escaped term. */
  pattern?: string;
}

/**
 * Canonical identity-slur list. Re-exported by the generation prompt guard
 * (`promptGuard.HARMFUL_SLURS`) so the article scanner, the prompt guard and
 * the explicit scan can never drift on what counts as a slur. Includes the
 * leetspeak evasions already observed in production.
 */
export const HARMFUL_SLURS: readonly string[] = [
  "nigger", "n1gger", "nigga", "chink", "spic", "kike",
  "wetback", "gook", "tranny", "faggot", "fag", "retard",
];

const ENTRIES: readonly LexiconEntry[] = [
  // ─── Profanity ────────────────────────────────────────────────────
  { term: "fuck", category: "profanity", pattern: String.raw`f+[uv]+c*k+(?:ing|in|er|ers|ed|s|face|wit|head)?|fck(?:ing|in|er)?|phuck\w*|motherfuck\w*` },
  { term: "shit", category: "profanity", pattern: String.raw`sh[i]+t+(?:s|ty|tier|tiest|head|hole|show|load)?|bullshit\w*|horseshit|apeshit|batshit|dipshit\w*` },
  { term: "bitch", category: "profanity", pattern: String.raw`bitch(?:es|ing|y|ed)?|biatch|biotch` },
  { term: "asshole", category: "profanity", pattern: String.raw`assholes?|arseholes?|asswipes?|asshats?` },
  { term: "ass", category: "profanity", pattern: String.raw`dumbass\w*|jackass\w*|badass\w*|smartass\w*|kick-?ass` },
  { term: "cunt", category: "profanity", pattern: String.raw`cunts?` },
  { term: "piss", category: "profanity", pattern: String.raw`piss(?:ed|ing|es)?` },
  { term: "dickhead", category: "profanity", pattern: String.raw`dickheads?` },
  { term: "bastard", category: "profanity", pattern: String.raw`bastards?` },
  { term: "bollocks", category: "profanity" },
  { term: "wanker", category: "profanity", pattern: String.raw`wank(?:er|ers|ing|ed|s)?` },
  { term: "twat", category: "profanity", pattern: String.raw`twats?` },
  { term: "goddamn", category: "profanity", pattern: String.raw`god ?damn\w*` },
  { term: "cocksucker", category: "profanity", pattern: String.raw`cocksuck\w*` },

  // ─── Sexual ───────────────────────────────────────────────────────
  { term: "porn", category: "sexual", pattern: String.raw`porn\w*` },
  { term: "nudes", category: "sexual", pattern: String.raw`nudes|nudity` },
  { term: "nsfw", category: "sexual" },
  { term: "onlyfans", category: "sexual", pattern: String.raw`only ?fans` },
  { term: "blowjob", category: "sexual", pattern: String.raw`blowjobs?|handjobs?` },
  { term: "dildo", category: "sexual", pattern: String.raw`dildos?` },
  { term: "orgasm", category: "sexual", pattern: String.raw`orgasm\w*` },
  { term: "erotic", category: "sexual", pattern: String.raw`erotic\w*` },
  { term: "hentai", category: "sexual" },
  { term: "milf", category: "sexual", pattern: String.raw`milfs?` },
  { term: "boobs", category: "sexual", pattern: String.raw`boobs?|boobies` },
  { term: "tits", category: "sexual", pattern: String.raw`tits|titties|titty` },
  { term: "cock", category: "sexual", pattern: String.raw`cocks?` },
  { term: "pussy", category: "sexual", pattern: String.raw`puss(?:y|ies)` },
  { term: "horny", category: "sexual" },
  { term: "cum", category: "sexual", pattern: String.raw`cum(?:shot|ming|s)?` },
  { term: "sex act", category: "sexual", pattern: String.raw`sexting|sex ?tapes?|sexy|(?:have|having|had) sex|anal sex|oral sex` },
  { term: "bdsm", category: "sexual" },
  { term: "strip club", category: "sexual", pattern: String.raw`strip ?clubs?` },
  { term: "slut", category: "sexual", pattern: String.raw`sluts?|slutty|whores?` },

  // ─── Weapons ──────────────────────────────────────────────────────
  { term: "gun", category: "weapons", pattern: String.raw`guns?|gunfire|gunshots?|gunman|gunmen|handguns?|shotguns?|machine ?guns?` },
  { term: "rifle", category: "weapons", pattern: String.raw`rifles?|assault weapons?` },
  { term: "pistol", category: "weapons", pattern: String.raw`pistols?` },
  { term: "firearm", category: "weapons", pattern: String.raw`firearms?` },
  { term: "ak-47", category: "weapons", pattern: String.raw`ak-?47s?|ar-?15s?|uzis?` },
  { term: "grenade", category: "weapons", pattern: String.raw`grenades?` },
  { term: "bomb", category: "weapons", pattern: String.raw`bombs?` },
  { term: "ammo", category: "weapons", pattern: String.raw`ammo|ammunition` },

  // ─── Violence / gore ──────────────────────────────────────────────
  { term: "gory", category: "violence" },
  { term: "bloodbath", category: "violence", pattern: String.raw`bloodbaths?|blood-?soaked` },
  { term: "behead", category: "violence", pattern: String.raw`behead\w*|decapitat\w*|dismember\w*|mutilat\w*` },
  { term: "massacre", category: "violence", pattern: String.raw`massacr\w*` },
  { term: "corpse", category: "violence", pattern: String.raw`corpses?|dead bod(?:y|ies)` },
  { term: "stab", category: "violence", pattern: String.raw`stabbed|stabbing|stabbings` },

  // ─── Drugs ────────────────────────────────────────────────────────
  { term: "cocaine", category: "drugs", pattern: String.raw`cocaine|crack pipes?` },
  { term: "heroin", category: "drugs" },
  { term: "meth", category: "drugs", pattern: String.raw`meth|methamphetamines?|crystal meth` },
  { term: "mdma", category: "drugs", pattern: String.raw`mdma|lsd` },
  { term: "getting high", category: "drugs", pattern: String.raw`(?:get|getting|got) high|smok(?:e|ing) (?:weed|pot|a joint|crack|meth)|snort(?:s|ing|ed)? (?:coke|cocaine|lines)|drug dealers?|420 friendly` },

  // ─── Hate ─────────────────────────────────────────────────────────
  ...HARMFUL_SLURS.map((slur): LexiconEntry => ({ term: slur, category: "hate" })),
  { term: "white power", category: "hate", pattern: String.raw`white power|sieg heil|heil hitler|kkk` },
];

/** Ordinary phrases that contain a lexicon word. Removed before matching. */
const IDIOMS: readonly RegExp[] = [
  /\b(?:magna |summa )?cum laude\b/giu,
  /\bcum[- ]dividends?\b/giu,
  /\b(?:nail|glue|staple|spray|heat|caulk|caulking|grease|radar|nerf|water|paint|massage|label|price|soldering|hot ?glue)[- ]guns?\b/giu,
  /\btop gun\b/giu,
  /\bjump(?:s|ed|ing)? the gun\b/giu,
  /\bsmoking guns?\b/giu,
  /\bbig guns\b/giu,
  /\b(?:stick|sticks|sticking|stuck) to (?:your|my|our|their|his|her) guns\b/giu,
  /\bson of a gun\b/giu,
  /\bgun[- ]shy\b/giu,
  /\bhired guns?\b/giu,
  /\bgreat guns\b/giu,
  /\bphoto ?bomb\w*\b/giu,
  /\bbath ?bombs?\b/giu,
  /\bseed ?bombs?\b/giu,
  /\b(?:the|da) bomb\b/giu,
  /\bchinks? in (?:the|their|his|her|its|our|my|your) armou?r\b/giu,
];

const LEET: Readonly<Record<string, string>> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i",
};

/** Word-shaped tokens; `!` counts only when followed by more of the word. */
const TOKEN = /[\p{L}\p{N}@$]+(?:!+[\p{L}\p{N}@$]+)*/gu;
/** Tokens with masking characters (`f*ck`, `sh#t`, `a**hole`). */
const MASKED_TOKEN = /[\p{L}\p{N}]*[*#][\p{L}\p{N}*#]*/gu;

/** Forms a masked token is compared against (same length, masks = any letter). */
const MASKABLE: ReadonlyArray<readonly [form: string, term: string, category: ExplicitCategory]> = [
  ["fuck", "fuck", "profanity"], ["fucking", "fuck", "profanity"], ["fucker", "fuck", "profanity"],
  ["fucked", "fuck", "profanity"], ["motherfucker", "fuck", "profanity"],
  ["shit", "shit", "profanity"], ["shitty", "shit", "profanity"], ["bullshit", "shit", "profanity"],
  ["bitch", "bitch", "profanity"], ["asshole", "asshole", "profanity"], ["ass", "ass", "profanity"],
  ["cunt", "cunt", "profanity"], ["bastard", "bastard", "profanity"], ["dickhead", "dickhead", "profanity"],
  ["porn", "porn", "sexual"], ["slut", "slut", "sexual"], ["whore", "slut", "sexual"],
  ["cock", "cock", "sexual"], ["pussy", "pussy", "sexual"],
  ["nigger", "nigger", "hate"], ["nigga", "nigga", "hate"], ["faggot", "faggot", "hate"],
];

/**
 * Every entry in ONE regex: one capture group per entry, word boundaries
 * stated once. Compiling ~45 separate `\p{L}` lookaround regexes cost ~70 ms
 * of CPU at every Worker isolate start (gap #2342); one regex compiles once.
 * No `i` flag — `normalize()` already lowercases (after NFKC), and Unicode
 * case-folding of `\p{L}` was most of the compile cost. Entry patterns use
 * only non-capturing groups, so group N+1 is entry N.
 */
const COMBINED = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${ENTRIES.map((e) => `(${e.pattern ?? escapeRegex(e.term)})`).join("|")})(?![\p{L}\p{N}])`,
  "gu",
);

/** Indexes (into ENTRIES) of every entry present in `text`. Restarts one
 *  character after each match start, so a term inside another entry's match
 *  ("meth" in "smoking meth") is still found — as per-entry tests did. */
function entriesIn(text: string, into: Set<number>): void {
  COMBINED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMBINED.exec(text)) !== null) {
    const group = m.findIndex((g, i) => i > 0 && g !== undefined);
    if (group > 0) into.add(group - 1);
    COMBINED.lastIndex = m.index + 1;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface LexiconMatch {
  category: ExplicitCategory;
  /** Canonical term — server logs / SuperAdmin only. */
  term: string;
}

function normalize(text: string): string {
  let out = text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'");
  for (const idiom of IDIOMS) out = out.replace(idiom, " ");
  return out;
}

/** Undo leetspeak inside words that mix letters with digits / symbols. */
function deLeet(text: string): string {
  return text.replace(TOKEN, (token) => {
    if (!/\p{L}/u.test(token) || !/[013457@$!]/.test(token)) return token;
    return token.replace(/[013457@$!]/g, (ch) => LEET[ch] ?? ch);
  });
}

function maskedMatches(text: string): LexiconMatch[] {
  const out: LexiconMatch[] = [];
  for (const [token] of text.matchAll(MASKED_TOKEN)) {
    if (token.length < 3 || !/\p{L}/u.test(token)) continue;
    const shape = new RegExp(`^${token.replace(/[*#]/g, ".")}$`, "u");
    const hit = MASKABLE.find(([form]) => form.length === token.length && shape.test(form));
    if (hit) out.push({ term: hit[1], category: hit[2] });
  }
  return out;
}

/**
 * Every lexicon term found in `text` (one entry per canonical term, in
 * lexicon order). Empty array = clean as far as the lexicon can tell.
 */
export function matchExplicitLexicon(text: string | null | undefined): LexiconMatch[] {
  if (!text || typeof text !== "string") return [];
  const plain = normalize(text);
  const leet = deLeet(plain);
  const hits = new Set<number>();
  entriesIn(plain, hits);
  if (leet !== plain) entriesIn(leet, hits);
  const found = new Map<string, LexiconMatch>();
  for (const i of [...hits].sort((a, b) => a - b)) {
    const entry = ENTRIES[i];
    found.set(entry.term, { term: entry.term, category: entry.category });
  }
  for (const match of maskedMatches(plain)) {
    if (!found.has(match.term)) found.set(match.term, match);
  }
  return [...found.values()];
}

/** Canonical terms of one category found in `text`. */
export function lexiconTermsIn(text: string, category: ExplicitCategory): string[] {
  return matchExplicitLexicon(text)
    .filter((m) => m.category === category)
    .map((m) => m.term);
}
