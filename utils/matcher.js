"use strict";

/**
 * matcher.js — 4-layer keyword filter
 *
 * Layer 1: Title quality gate (length, ASCII, not a nav link)
 * Layer 2: Must match a SOFTWARE/TECH intern or new-grad pattern
 * Layer 3: Must NOT be a false positive (nav, blog, non-India location)
 * Layer 4: Must NOT be a non-tech role (HR, Marketing, Finance, etc.)
 */

const MIN_LEN = 4;
const MAX_LEN = 100;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function cleanTitle(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJobTitle(title) {
  if (title.length < MIN_LEN || title.length > MAX_LEN) return false;
  const ascii = (title.match(/[\x20-\x7E]/g) || []).length;
  if (ascii / title.length < 0.75) return false;
  if (!/[a-zA-Z]{3}/.test(title)) return false;
  if (/^[→←↑↓►◄•·⚡🔥📌🚀💡#@]/.test(title)) return false;
  if (/^\d+\.\s/.test(title)) return false;   // "1. Junior Dev" = nav list
  return true;
}

// ─── LAYER 2 — TECH PATTERNS (what we want) ──────────────────────────────────

const TECH_PATTERNS = [
  /\bsoftware\s+(?:engineering?\s+)?intern(?:ship)?\b/i,
  /\bsde[\s-]*intern(?:ship)?\b/i,
  /\bswe[\s-]*intern(?:ship)?\b/i,
  /\bengineer(?:ing)?\s+intern(?:ship)?\b/i,
  /\btech(?:nology)?\s+intern(?:ship)?\b/i,
  /\bengineering\s+internship\b/i,

  /\bfull[\s-]?stack\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfront[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfrontend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bback[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bbackend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bweb\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  /\bdevops\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bdev[\s-]ops\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bsre\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bsite[\s-]reliability\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bplatform\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bcloud\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\binfra(?:structure)?\s+(?:engineer\s+)?intern(?:ship)?\b/i,

  /\bmobile\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bandroid\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bios\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  /\bdata\s+(?:science|scientist|engineer(?:ing)?|analytics?)\s+intern(?:ship)?\b/i,
  /\bml\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bmachine[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bai\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bdeep[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bresearch\s+(?:engineer\s+|scientist\s+)?intern(?:ship)?\b/i,

  /\bsecurity\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bcyber\s*security\s+(?:analyst\s+)?intern(?:ship)?\b/i,
  /\bqa\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\btest(?:ing|er)?\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\bautomation\s+(?:test\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bembedded\s+(?:software\s+)?intern(?:ship)?\b/i,
  /\breact\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bnode(?:\.js)?\s+(?:developer\s+)?intern(?:ship)?\b/i,
  /\bpython\s+(?:developer\s+)?intern(?:ship)?\b/i,
  /\bjava\s+(?:developer\s+)?intern(?:ship)?\b/i,

  // New grad / entry-level — software specific
  /\bsoftware\s+(?:engineer|developer)\s+fresher\b/i,
  /\bfresher\s+software\s+(?:engineer|developer)\b/i,
  /\btech\s+fresher\b/i,
  /\bnew[\s-]grad(?:uate)?\b/i,
  /\bgraduate\s+(?:software\s+)?engineer\b/i,
  /\bgraduate\s+trainee\b/i,
  /\bcampus\s+(?:hire|recruit|placement)\b/i,
  /\bentry[\s-]level\s+(?:software\s+|tech\s+)?engineer\b/i,
  /\bassociate\s+(?:software\s+engineer|sde|member\s+of\s+technical\s+staff|developer)\b/i,
  /\bjunior\s+(?:software\s+|full[\s-]?stack\s+|frontend?\s+|backend?\s+|devops\s+)?(?:engineer|developer)\b/i,
  /\bjr\.?\s*(?:software\s+)?(?:engineer|developer)\b/i,
  /\bsde[\s-]?1\b/i,
  /\bsde[\s-]?i\b/i,
  /\bassociate\s+sde\b/i,
  /\btrainee\s+(?:software\s+)?engineer\b/i,
  /\bmember\s+of\s+technical\s+staff\b/i,
];

// ─── LAYER 3 — FALSE POSITIVE BLOCKLIST ───────────────────────────────────────

// All 50 US state codes — catches "Austin, TX" "Austin, TXNew York" etc.
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];
const US_STATE_RE = new RegExp(",?\\s*\\b(" + US_STATES.join("|") + ")\\b", "i");

const FALSE_POSITIVES = [
  // International / Internal
  /\binternational\b/i,
  /\binternal\b/i,

  // US cities
  /\baustin\b/i,
  /\bsan francisco\b/i,
  /\bsunnyvale\b/i,
  /\bmountain view\b/i,
  /\bmenlo park\b/i,
  /\bpalo alto\b(?!\s+networks)/i,
  /\bseattle\b/i,
  /\bchicago\b/i,
  /\bboston\b/i,
  /\blos angeles\b/i,
  /\bsan jose\b/i,
  /\bsan diego\b/i,
  /\batlanta\b/i,
  /\bdenver\b/i,
  /\bnew york\b/i,
  /\bwashington,?\s*dc\b/i,
  US_STATE_RE,

  // Non-India countries & cities
  /\blondon\b/i,
  /\bmanchester\b/i,
  /\bbirmingham\b/i,
  /\bedinburgh\b/i,
  /\bsingapore\b/i,
  /\bdubai\b/i,
  /\babu dhabi\b/i,
  /\btokyo\b/i,
  /\bbeijing\b/i,
  /\bshanghai\b/i,
  /\bsydney\b/i,
  /\bmelbourne\b/i,
  /\btoronto\b/i,
  /\bvancouver\b/i,
  /\bamsterdam\b/i,
  /\bberlin\b/i,
  /\bparis\b/i,
  /\bdublin\b/i,
  /\bzurich\b/i,
  /\bwarsaw\b/i,

  // Country names
  /\bunited states\b/i,
  /\bunited kingdom\b/i,
  /\busa\b/i,
  /\bu\.s\.a\b/i,
  /\bengland\b/i,
  /\buk\b/i,
  /\bcanada\b/i,
  /\baustralia\b/i,
  /\bgermany\b/i,
  /\bnetherlands\b/i,
  /\bpoland\b/i,
  /\bireland\b/i,

  // Remote non-India
  /\bremote[\s-]*(?:us|uk|usa|europe|eu|global)\b/i,
  /\bus[\s-]*remote\b/i,
  /\buk[\s-]*remote\b/i,

  // Navigation / category links
  /fresher jobs (?:in|by|for)\b/i,
  /\bview all fresher/i,
  /\bfresher jobs by/i,
  /\bjobs by places\b/i,
  /\bjobs by type\b/i,
  /\bsearch internships\b/i,
  /\bsearch.*new grad\b/i,
  /^search\b/i,
  /^view\b/i,
  /^browse\b/i,
  /^explore\b/i,
  /^find\b/i,
  /^apply\b/i,
  /^click here/i,
  /^see all/i,
  /^load more/i,
  /^show more/i,

  // Page text scraped as title
  /^experience:\s*/i,
  /^location:\s*/i,
  /location:\s*\w+/i,
  /experience:\s*fresher/i,

  // Blog / story sentences
  /from intern to full.?time/i,
  /transitioning from an? intern/i,
  /started.*as an intern/i,
  /joined.*as an intern/i,
  /my .+ internship/i,
  /intern to .+(?:engineer|manager|seller|staff)/i,
  /what it.s like/i,
  /how .+ navigated/i,
  /day internship\b/i,
  /internship program graduate/i,
  /hosts .+ internship/i,

  // Error / blocked pages
  /this page is blocked/i,
  /blocked under .+ policy/i,
  /must be a .+ employee/i,
  /blue.badge employee/i,
  /requires vpn/i,
  /stable internet connection/i,
];

// ─── LAYER 4 — NON-TECH ROLES ─────────────────────────────────────────────────

const NON_TECH = [
  /\bhr\b.{0,20}intern/i,
  /\bhrbp\b.{0,20}intern/i,
  /\bhuman\s+resources?\b.{0,20}intern/i,
  /\bpeople\s+(?:ops|operations?)\b.{0,20}intern/i,
  /\btalent\s+(?:acquisition|management)\b.{0,20}intern/i,
  /\brecruit\w*\b.{0,20}intern/i,
  /\bl&d\b.{0,20}intern/i,
  /\blearning\s+(?:and|&)\s+development\b.{0,20}intern/i,
  /\bmarketing\b.{0,20}intern/i,
  /\bdigital\s+marketing\b.{0,20}intern/i,
  /\bsocial\s+media\b.{0,20}intern/i,
  /\bcontent\b.{0,20}intern/i,
  /\bbrand\b.{0,20}intern/i,
  /\bseo\b.{0,20}intern/i,
  /\bsem\b.{0,20}intern/i,
  /\bcopywriting\b.{0,20}intern/i,
  /\bcreative\b.{0,20}intern/i,
  /\bperformance\s+marketing\b.{0,20}intern/i,
  /\bsales\b.{0,20}intern/i,
  /\bbusiness\s+development\b.{0,20}intern/i,
  /\baccount\s+(?:management|executive)\b.{0,20}intern/i,
  /\bcustomer\s+(?:success|support|service)\b.{0,20}intern/i,
  /\bpartnership\b.{0,20}intern/i,
  /\bfinance\b.{0,20}intern/i,
  /\baccountan\w+\b.{0,20}intern/i,
  /\baudit\b.{0,20}intern/i,
  /\btax\b.{0,20}intern/i,
  /\bfp&a\b.{0,20}intern/i,
  /\blegal\b.{0,20}intern/i,
  /\bcompliance\b.{0,20}intern/i,
  /\bca\s+intern/i,
  /\boperations?\b.{0,20}intern/i,
  /\bsupply\s+chain\b.{0,20}intern/i,
  /\blogistics\b.{0,20}intern/i,
  /\bprocurement\b.{0,20}intern/i,
  /\bwarehouse\b.{0,20}intern/i,
  /\bgraphic\s+design\b.{0,20}intern/i,
  /\bvisual\s+design\b.{0,20}intern/i,
  /\bmotion\s+design\b.{0,20}intern/i,
  /\billustrat\w+\b.{0,20}intern/i,
  /\bcommunication\s+design\b.{0,20}intern/i,
  /\bmba\s+fresher\b/i,
  /\bmba\b.{0,10}intern/i,
  /\bcivil\s+fresher\b/i,
  /\bcivil\b.{0,10}intern/i,
  /\bmedical\b.{0,10}intern/i,
  /\bclinical\b.{0,10}intern/i,
  /\bnursing\b.{0,10}intern/i,
  /\bpharmac\w+\b.{0,10}intern/i,
  /\baccounts\s+fresher\b/i,
  /\bpr\b.{0,10}intern/i,
  /\bpublic\s+relations\b.{0,10}intern/i,
  /\bevent\b.{0,10}intern/i,
];

// ─── DEDUP NORMALISER ─────────────────────────────────────────────────────────

/**
 * Strip trailing location/noise so "SDE-I Bengaluru, India Apply Here"
 * and "SDE-I" produce the same dedup key.
 */
function normaliseForDedup(title) {
  return title
    .toLowerCase()
    .replace(
      /\s+(?:bengaluru|bangalore|hyderabad|pune|chennai|mumbai|noida|gurgaon|gurugram|delhi|kolkata|india)\b.*/i,
      ""
    )
    .replace(/\s+apply here.*$/i, "")
    .replace(/\s+apply\s*[→>].*$/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── CORE FUNCTIONS ───────────────────────────────────────────────────────────

function isTargetJob(rawTitle) {
  const title = cleanTitle(rawTitle);

  if (!looksLikeJobTitle(title))
    return { matched: false, reason: "quality_fail" };

  if (!TECH_PATTERNS.some((p) => p.test(title)))
    return { matched: false, reason: "no_tech_pattern" };

  if (FALSE_POSITIVES.some((p) => p.test(title)))
    return { matched: false, reason: "false_positive" };

  if (NON_TECH.some((p) => p.test(title)))
    return { matched: false, reason: "non_tech_role" };

  return { matched: true };
}

/**
 * Filter + deduplicate a list of { title, url } within a single company's results.
 */
function filterJobs(jobs) {
  const seenKeys = new Set();
  const result   = [];

  for (const job of jobs) {
    const title    = cleanTitle(job.title || "");
    const dedupKey = normaliseForDedup(title);

    if (!dedupKey || seenKeys.has(dedupKey)) continue;

    const { matched } = isTargetJob(title);
    if (matched) {
      seenKeys.add(dedupKey);
      result.push({ ...job, title });
    }
  }

  return result;
}

module.exports = { isTargetJob, filterJobs, cleanTitle, normaliseForDedup };
