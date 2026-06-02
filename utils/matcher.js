"use strict";

/**
 * matcher.js — Strict 4-layer keyword filter for India Job Scraper
 *
 * WHAT WE WANT:
 *   - Software/tech intern roles (any stack)
 *   - New grad / fresher / SDE-1 / Associate SDE (software only)
 *   - India onsite OR Remote (anywhere) roles
 *
 * FOUR LAYERS:
 *   1. Title quality gate
 *   2. Must match a SOFTWARE/TECH intern or new-grad pattern
 *   3. Must NOT be a false positive (nav links, blog posts, non-India locations)
 *   4. Must NOT be a non-tech role (HR, Marketing, Finance, MBA, Civil etc.)
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — QUALITY GATE
// ─────────────────────────────────────────────────────────────────────────────
const MIN_LEN = 4;
const MAX_LEN = 100;

function cleanTitle(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJobTitle(title) {
  if (title.length < MIN_LEN || title.length > MAX_LEN) return false;

  // Must be mostly ASCII (catches binary garbage)
  const asciiChars = (title.match(/[\x20-\x7E]/g) || []).length;
  if (asciiChars / title.length < 0.75) return false;

  // Must contain at least one English word of 3+ characters
  if (!/[a-zA-Z]{3}/.test(title)) return false;

  // Block obvious navigation/icon starts
  if (/^[→←↑↓►◄•·⚡🔥📌🚀💡#@]/.test(title)) return false;

  // Block numbered list items like "1. Junior Fullstack Developer" (Wysa nav)
  if (/^\d+\.\s/.test(title)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — SOFTWARE / TECH PATTERNS (what we DO want)
// All use \b — "International" will NOT match \bintern\b
// ─────────────────────────────────────────────────────────────────────────────
const TECH_PATTERNS = [
  // Generic software intern
  /\bsoftware\s+(?:engineering?\s+)?intern(?:ship)?\b/i,
  /\bsde[\s-]*intern(?:ship)?\b/i,
  /\bswe[\s-]*intern(?:ship)?\b/i,
  /\bengineer(?:ing)?\s+intern(?:ship)?\b/i,
  /\btech(?:nology)?\s+intern(?:ship)?\b/i,
  /\bengineering\s+internship\b/i,

  // Stack-specific
  /\bfull[\s-]?stack\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfront[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfrontend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bback[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bbackend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bweb\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  // Infrastructure / DevOps / SRE
  /\bdevops\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bdev[\s-]ops\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bsre\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bsite[\s-]reliability\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bplatform\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bcloud\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\binfra(?:structure)?\s+(?:engineer\s+)?intern(?:ship)?\b/i,

  // Mobile
  /\bmobile\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bandroid\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bios\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  // Data / ML / AI
  /\bdata\s+(?:science|scientist|engineer(?:ing)?|analytics?)\s+intern(?:ship)?\b/i,
  /\bml\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bmachine[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bai\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bdeep[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bresearch\s+(?:engineer\s+|scientist\s+)?intern(?:ship)?\b/i,

  // Security / QA / Test
  /\bsecurity\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bcyber\s*security\s+(?:analyst\s+)?intern(?:ship)?\b/i,
  /\bqa\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\btest(?:ing|er)?\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\bautomation\s+(?:test\s+|engineer\s+)?intern(?:ship)?\b/i,

  // Other tech
  /\bembedded\s+(?:software\s+)?intern(?:ship)?\b/i,
  /\breact\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bnode(?:\.js)?\s+(?:developer\s+)?intern(?:ship)?\b/i,
  /\bpython\s+(?:developer\s+)?intern(?:ship)?\b/i,
  /\bjava\s+(?:developer\s+)?intern(?:ship)?\b/i,

  // New grad / fresher / associate — SOFTWARE ONLY
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

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — FALSE POSITIVE BLOCKLIST
// ─────────────────────────────────────────────────────────────────────────────

// All US state abbreviations (catches "Austin, TX" "New York, NY" even when
// concatenated without spaces like "Austin, TXNew York, NY")
const US_STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];
// Matches ", TX" or ",TX" or "TX" as a standalone word — even when
// concatenated like "Austin, TXNew York" the regex catches ", TX" part
const US_STATE_REGEX = new RegExp(
  ",?\\s*\\b(" + US_STATE_CODES.join("|") + ")\\b",
  "i"
);

const FALSE_POSITIVE_PATTERNS = [
  // "International" / "Internal"
  /\binternational\b/i,
  /\binternal\b/i,

  // ── NON-INDIA COUNTRIES / CITIES ─────────────────────────────
  // US cities
  /\baustin\b/i,
  /\bsan francisco\b/i,
  /\bsunnyvale\b/i,
  /\bmountain view\b/i,
  /\bmenlo park\b/i,
  /\bpalo alto\b(?!\s+networks)/i,  // allow "Palo Alto Networks" but block "Palo Alto, CA"
  /\bseattle\b/i,
  /\bchicago\b/i,
  /\bboston\b/i,
  /\blos angeles\b/i,
  /\bsan jose\b/i,
  /\bsan diego\b/i,
  /\batlanta\b/i,
  /\bdenver\b/i,
  /\bportland\b/i,
  /\bphoenix\b/i,
  /\bnew york\b/i,
  /\bwashington,?\s*dc\b/i,

  // US state codes — catches "Austin, TX" "New York, NY" even concatenated
  US_STATE_REGEX,

  // Other non-India countries / regions
  /\blondon\b/i,
  /\bmanchester\b/i,
  /\bbirmingham\b/i,
  /\bedinburgh\b/i,
  /\bsingapore\b/i,
  /\bdubai\b/i,
  /\babu dhabi\b/i,
  /\btokyos?\b/i,
  /\bbeijing\b/i,
  /\bshanghai\b/i,
  /\bsydney\b/i,
  /\bmelbourne\b/i,
  /\btoronto\b/i,
  /\bvancouver\b/i,
  /\bamsterdam\b/i,
  /\bberlin\b/i,
  /\bparis\b/i,
  /\bwarsaw\b/i,
  /\bkrakow\b/i,
  /\bdublin\b/i,
  /\bzurich\b/i,

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

  // Remote US/UK (allow generic "remote" but block geo-qualified remote)
  /\bremote[\s-]*(?:us|uk|usa|europe|eu|global)\b/i,
  /\bus[\s-]*remote\b/i,
  /\buk[\s-]*remote\b/i,

  // ── NAVIGATION / CATEGORY LINKS ──────────────────────────────
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

  // ── PAGE TEXT SCRAPED AS TITLES ───────────────────────────────
  /^experience:\s*/i,
  /^location:\s*/i,
  /location:\s*\w+/i,
  /experience:\s*fresher/i,

  // ── BLOG / STORY SENTENCES ────────────────────────────────────
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
  /rethinking leadership/i,
  /sabbatical transformed/i,
  /journey to becoming/i,

  // ── ERROR / BLOCKED PAGES ─────────────────────────────────────
  /this page is blocked/i,
  /blocked under .+ policy/i,
  /must be a .+ employee/i,
  /blue.badge employee/i,
  /requires vpn/i,
  /stable internet connection/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — NON-TECH ROLE EXCLUSIONS
// ─────────────────────────────────────────────────────────────────────────────
const NON_TECH_PATTERNS = [
  // HR / People
  /\bhr\b.{0,20}intern/i,
  /\bhrbp\b.{0,20}intern/i,
  /\bhuman\s+resources?\b.{0,20}intern/i,
  /\bpeople\s+(?:ops|operations?)\b.{0,20}intern/i,
  /\btalent\s+(?:acquisition|management)\b.{0,20}intern/i,
  /\brecruit\w*\b.{0,20}intern/i,
  /\bl&d\b.{0,20}intern/i,
  /\blearning\s+(?:and|&)\s+development\b.{0,20}intern/i,

  // Marketing / Brand / Growth
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

  // Sales / BD / Customer
  /\bsales\b.{0,20}intern/i,
  /\bbusiness\s+development\b.{0,20}intern/i,
  /\baccount\s+(?:management|executive)\b.{0,20}intern/i,
  /\bcustomer\s+(?:success|support|service)\b.{0,20}intern/i,
  /\bpartnership\b.{0,20}intern/i,

  // Finance / Legal
  /\bfinance\b.{0,20}intern/i,
  /\baccountan\w+\b.{0,20}intern/i,
  /\baudit\b.{0,20}intern/i,
  /\btax\b.{0,20}intern/i,
  /\bfp&a\b.{0,20}intern/i,
  /\blegal\b.{0,20}intern/i,
  /\bcompliance\b.{0,20}intern/i,
  /\bca\s+intern/i,

  // Operations
  /\boperations?\b.{0,20}intern/i,
  /\bsupply\s+chain\b.{0,20}intern/i,
  /\blogistics\b.{0,20}intern/i,
  /\bprocurement\b.{0,20}intern/i,
  /\bwarehouse\b.{0,20}intern/i,

  // Design (non-engineering)
  /\bgraphic\s+design\b.{0,20}intern/i,
  /\bvisual\s+design\b.{0,20}intern/i,
  /\bmotion\s+design\b.{0,20}intern/i,
  /\billustrat\w+\b.{0,20}intern/i,
  /\bcommunication\s+design\b.{0,20}intern/i,

  // Non-tech freshers
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

// ─────────────────────────────────────────────────────────────────────────────
// DEDUP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a title for dedup — strips trailing location noise so
 * "SDE-I Bengaluru, India Apply Here" and "SDE-I" get the same key.
 */
function normaliseForDedup(title) {
  return title
    .toLowerCase()
    // Remove common India city + apply noise
    .replace(
      /\s+(?:bengaluru|bangalore|hyderabad|pune|chennai|mumbai|noida|gurgaon|gurugram|delhi|kolkata|india)\b.*/i,
      ""
    )
    .replace(/\s+apply here.*$/i, "")
    .replace(/\s+apply\s*[→>].*$/i, "")
    // Remove em-dash / en-dash separators and what follows (location after dash)
    .replace(/\s*[—–-]\s*(?:bionic|core|provider|forward|vision|computer).*/i, "")
    // Remove all non-alphanumeric except spaces
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE MATCH FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns { matched: boolean, reason?: string }
 */
function isTargetJob(rawTitle) {
  const title = cleanTitle(rawTitle);

  // Layer 1 — quality
  if (!looksLikeJobTitle(title)) {
    return { matched: false, reason: "quality_fail" };
  }

  // Layer 2 — must match a tech pattern
  const techMatch = TECH_PATTERNS.some((p) => p.test(title));
  if (!techMatch) {
    return { matched: false, reason: "no_tech_pattern" };
  }

  // Layer 3 — must not be a false positive / non-India location
  const isFP = FALSE_POSITIVE_PATTERNS.some((p) => p.test(title));
  if (isFP) {
    return { matched: false, reason: "false_positive" };
  }

  // Layer 4 — must not be a non-tech role
  const isNonTech = NON_TECH_PATTERNS.some((p) => p.test(title));
  if (isNonTech) {
    return { matched: false, reason: "non_tech_role" };
  }

  return { matched: true };
}

/**
 * Filter + deduplicate a list of { title, url } objects.
 * Uses normalised title as the dedup key so location-suffixed duplicates
 * (e.g. "SDE-I Bengaluru, India Apply Here" vs "SDE-I") are caught.
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
