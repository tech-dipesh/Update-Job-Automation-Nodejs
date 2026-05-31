"use strict";

/**
 * matcher.js — Strict keyword filter for India Tech Job Scraper
 *
 * WHAT WE WANT:
 *   - Software/tech intern roles (any stack)
 *   - New grad / fresher / SDE-1 / Associate SDE (software only)
 *   - India onsite roles only
 *
 * FOUR-LAYER FILTERING:
 *   1. Title quality gate (length, ASCII ratio, not a nav link)
 *   2. Must match a SOFTWARE/TECH intern or new-grad pattern
 *   3. Must NOT be a false positive (navigation, blog, error page, location text)
 *   4. Must NOT be a non-tech role (HR, Marketing, Finance, MBA, Civil, etc.)
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — QUALITY GATE
// ─────────────────────────────────────────────────────────────────────────────
const MIN_LEN = 4;
const MAX_LEN = 100;  // real job titles are short — "Fresher Jobs in Bangalore" is 26 chars but is navigation

/**
 * Normalise whitespace and strip zero-width / control characters
 */
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

  // Must NOT start with obvious navigation/icon/bullet characters
  if (/^[→←↑↓►◄•·⚡🔥📌🚀💡#@]/.test(title)) return false;
  // Block numbered list items like "1. Junior Fullstack Developer" (Wysa nav)
  if (/^\d+\.\s/.test(title)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — SOFTWARE / TECH PATTERNS  (what we DO want)
// All use \b word boundaries — "International" will NOT match \bintern\b
// ─────────────────────────────────────────────────────────────────────────────
const TECH_PATTERNS = [
  // ── Generic software intern ─────────────────────────────────────────────
  /\bsoftware\s+(?:engineering?\s+)?intern(?:ship)?\b/i,
  /\bsde[\s-]*intern(?:ship)?\b/i,
  /\bswe[\s-]*intern(?:ship)?\b/i,
  /\bengineer(?:ing)?\s+intern(?:ship)?\b/i,
  /\btech(?:nology)?\s+intern(?:ship)?\b/i,

  // ── Stack-specific interns ───────────────────────────────────────────────
  /\bfull[\s-]?stack\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfront[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfrontend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bback[\s-]?end\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bbackend?\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bweb\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  // ── Infrastructure / DevOps / SRE ────────────────────────────────────────
  /\bdevops\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bdev[\s-]ops\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bsre\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bsite[\s-]reliability\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bplatform\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bcloud\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\binfra(?:structure)?\s+(?:engineer\s+)?intern(?:ship)?\b/i,

  // ── Mobile ───────────────────────────────────────────────────────────────
  /\bmobile\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bandroid\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bios\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  // ── Data / ML / AI ───────────────────────────────────────────────────────
  /\bdata\s+(?:science|scientist|engineer(?:ing)?|analytics?)\s+intern(?:ship)?\b/i,
  /\bml\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bmachine[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bai\s+(?:engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bdeep[\s-]learning\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bresearch\s+(?:engineer\s+|scientist\s+)?intern(?:ship)?\b/i,

  // ── Security / QA / Test ─────────────────────────────────────────────────
  /\bsecurity\s+(?:engineer\s+)?intern(?:ship)?\b/i,
  /\bcyber\s*security\s+(?:analyst\s+)?intern(?:ship)?\b/i,
  /\bqa\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\btest(?:ing|er)?\s+(?:engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\bautomation\s+(?:test\s+|engineer\s+)?intern(?:ship)?\b/i,

  // ── Other tech roles ─────────────────────────────────────────────────────
  /\bembedded\s+(?:software\s+)?intern(?:ship)?\b/i,
  /\breact\s+(?:developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bnode(?:\.js)?\s+(?:developer\s+)?intern(?:ship)?\b/i,
  /\bpython\s+(?:developer\s+)?intern(?:ship)?\b/i,
  /\bjava\s+(?:developer\s+)?intern(?:ship)?\b/i,

  // ── New grad / fresher / associate — SOFTWARE ONLY ───────────────────────
  // Note: bare "fresher" is NOT included — too broad (matches "MBA Fresher", "HR Fresher" etc.)
  // We only match "fresher" when paired with a tech keyword
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
  /\bsde[\s-]?i\b/i,                              // SDE I (word boundary stops "SDE in")
  /\bassociate\s+sde\b/i,
  /\btrainee\s+(?:software\s+)?engineer\b/i,
  /\bmember\s+of\s+technical\s+staff\b/i,         // MTS — valid for companies like 5C, Wysa

  // ── Engineering internship (generic) ────────────────────────────────────
  /\bengineering\s+internship\b/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — FALSE POSITIVE BLOCKLIST
// Patterns that match Layer 2 but are NOT actual job postings
// ─────────────────────────────────────────────────────────────────────────────
const FALSE_POSITIVE_PATTERNS = [
  // "International" / "Internal" — most common false positive
  /\binternational\b/i,
  /\binternal\b/i,

  // Navigation / category links scraped from Internshala, Naukri etc.
  /fresher jobs (in|by|for)\b/i,         // "Fresher Jobs in Bangalore"
  /\bview all fresher/i,                  // "View all fresher jobs"
  /\bfresher jobs by/i,                   // "Fresher Jobs by Places"
  /\bjobs by places\b/i,
  /\bjobs by type\b/i,
  /\bsearch internships\b/i,              // "Search Internships and New Grad Jobs" — Palo Alto button
  /\bsearch.*new grad\b/i,
  /^search\b/i,                           // any title starting with "Search"
  /^view\b/i,                             // any title starting with "View"
  /^browse\b/i,                           // "Browse all jobs"
  /^explore\b/i,
  /^find\b/i,                             // "Find internships"
  /^apply\b/i,

  // Location-only strings scraped as titles (Faircent style)
  /^experience:\s*/i,                     // "Experience: Fresher Location: Gurgaon"
  /^location:\s*/i,
  /location:\s*\w+/i,
  /experience:\s*fresher/i,

  // Blog post / story sentences
  /from intern to full.?time/i,
  /transitioning from an? intern/i,
  /started.*as an intern/i,
  /joined.*as an intern/i,
  /my .+ internship/i,
  /intern to .+(engineer|manager|seller|staff)/i,
  /what it.s like/i,
  /how .+ navigated/i,
  /day internship\b/i,
  /internship program graduate/i,
  /hosts .+ internship/i,
  /rethinking leadership/i,
  /sabbatical transformed/i,
  /journey to becoming/i,

  // Error / blocked pages
  /this page is blocked/i,
  /blocked under .+ policy/i,
  /must be a .+ employee/i,
  /blue.badge employee/i,
  /requires vpn/i,
  /stable internet connection/i,
  /communication with applicants/i,

  // Outside India — catch common non-India locations in title
  // (we only want India onsite roles)
  /\blondon\b/i,
  /\baustin,?\s+tx\b/i,
  /\bnew york\b/i,
  /\bpalo alto,?\s+ca\b/i,
  /\bseattle,?\s+wa\b/i,
  /\bsan francisco\b/i,
  /\bsunnyvale\b/i,
  /\bmountain view\b/i,
  /\bmenlo park\b/i,
  /\bnew york,?\s+ny\b/i,
  /\bwashington,?\s+dc\b/i,
  /\bboston,?\s+ma\b/i,
  /\bchicago,?\s+il\b/i,
  /\bsingapore\b/i,
  /\bdubai\b/i,
  /\bremote\s*[-–]\s*us\b/i,
  /\bremote\s*[-–]\s*uk\b/i,
  /\bunited states\b/i,
  /\bunited kingdom\b/i,
  /\busa\b/i,
  /\bu\.s\.a\b/i,
  /\buk\b/i,                              // careful — "UK" alone could be too broad
];

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — NON-TECH ROLE EXCLUSIONS (SOFTWARE roles only)
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

  // Finance / Accounting / Legal
  /\bfinance\b.{0,20}intern/i,
  /\baccountan\w+\b.{0,20}intern/i,
  /\baudit\b.{0,20}intern/i,
  /\btax\b.{0,20}intern/i,
  /\bfp&a\b.{0,20}intern/i,
  /\blegal\b.{0,20}intern/i,
  /\bcompliance\b.{0,20}intern/i,
  /\bca\s+intern/i,

  // Operations / Supply chain
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

  // MBA / Civil / Medical / Other non-tech freshers
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
 * Normalise a title for dedup comparison.
 * Strips trailing location strings like "Bengaluru, India Apply Here"
 */
function normaliseForDedup(title) {
  return title
    .toLowerCase()
    // Remove trailing location + apply noise
    .replace(/\s+(bengaluru|bangalore|hyderabad|pune|chennai|mumbai|noida|gurgaon|delhi|kolkata|india)\b.*/i, "")
    .replace(/\s+apply here.*$/i, "")
    .replace(/\s+apply\s*→.*$/i, "")
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

  // Layer 3 — must not be a false positive
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
 * Dedup is done on normalised title so "SDE-I Bengaluru, India Apply Here"
 * and "SDE-I" are treated as the same job.
 */
function filterJobs(jobs) {
  const seenKeys  = new Set();
  const result    = [];

  for (const job of jobs) {
    const title   = cleanTitle(job.title || "");
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
/**
 * Filter a list of { title, url } objects, returning only real tech jobs.
 *
 * @param {Array<{title: string, url: string}>} jobs
 * @returns {Array<{title: string, url: string}>}
 */
function filterJobs(jobs) {
  const seen = new Set();
  const result = [];

  for (const job of jobs) {
    const title = cleanTitle(job.title || "");
    const key = title.toLowerCase();

    if (seen.has(key)) continue;  // dedup within single-company results
    seen.add(key);

    const { matched } = isTargetJob(title);
    if (matched) {
      result.push({ ...job, title });
    }
  }

  return result;
}

module.exports = { isTargetJob, filterJobs, cleanTitle };
