"use strict";

/**
 * matcher.js — Keyword regex engine for India Tech Job Scraper
 *
 * THREE-LAYER FILTERING:
 *   1. MUST match a software/tech intern or new-grad pattern
 *   2. MUST NOT match known false-positive patterns (International, Internal, etc.)
 *   3. MUST NOT be a non-tech role (HR, Marketing, Finance, Design, etc.)
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — TECH INTERN / NEW-GRAD patterns  (word-boundary safe)
// Uses \b which does NOT match inside "International" or "Internal"
// ─────────────────────────────────────────────────────────────────────────────
const TECH_INTERN_PATTERNS = [
  // Generic software intern
  /\bsoftware\s+(engineering?\s+)?intern(?:ship)?\b/i,
  /\bsde[\s-]*intern(?:ship)?\b/i,
  /\bswe[\s-]*intern(?:ship)?\b/i,
  /\bengineer(?:ing)?\s+intern(?:ship)?\b/i,

  // Stack-specific
  /\bfull[\s-]?stack\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bfront[\s-]?end\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bbackend?\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bback[\s-]end\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  // Infrastructure
  /\bdevops\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bdev[\s-]ops\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bsre\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bsite[\s-]reliability\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bplatform\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bcloud\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\binfra(?:structure)?\s+(engineer\s+)?intern(?:ship)?\b/i,

  // Mobile
  /\bmobile\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bandroid\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bios\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,

  // Data / AI / ML
  /\bdata\s+(science|scientist|engineer(?:ing)?|analytics?)\s+intern(?:ship)?\b/i,
  /\bml\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bmachine[\s-]learning\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bai\s+(engineer\s+|research\s+)?intern(?:ship)?\b/i,
  /\bdeep[\s-]learning\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bresearch\s+(engineer\s+|scientist\s+)?intern(?:ship)?\b/i,

  // Security
  /\bsecurity\s+(engineer\s+)?intern(?:ship)?\b/i,
  /\bcyber\s*security\s+(analyst\s+)?intern(?:ship)?\b/i,

  // QA / Test
  /\bqa\s+(engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\btest(?:ing)?\s+(engineer\s+|automation\s+)?intern(?:ship)?\b/i,
  /\bautomation\s+(engineer\s+)?intern(?:ship)?\b/i,

  // Web / App dev
  /\bweb\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\breact\s+(developer\s+|engineer\s+)?intern(?:ship)?\b/i,
  /\bnode(?:\.js)?\s+(developer\s+)?intern(?:ship)?\b/i,
  /\bpython\s+(developer\s+)?intern(?:ship)?\b/i,
  /\bjava\s+(developer\s+)?intern(?:ship)?\b/i,
  /\bembedded\s+(software\s+)?intern(?:ship)?\b/i,

  // "tech intern" / "technology intern"
  /\btechn?(?:ology)?\s+intern(?:ship)?\b/i,

  // New grad / fresher / associate — tech roles only (combined below)
  /\bnew[\s-]grad(?:uate)?\b/i,
  /\bgraduate\s+(?:software\s+)?engineer\b/i,
  /\bgraduate\s+trainee\b/i,
  /\bfresher\b/i,
  /\bcampus\s+(?:hire|recruit|placement)\b/i,
  /\bentry[\s-]level\s+(?:software\s+|tech\s+)?engineer\b/i,
  /\bassociate\s+(?:software\s+engineer|member\s+of\s+technical\s+staff|developer|sde)\b/i,
  /\bjunior\s+(?:software\s+|full[\s-]?stack\s+|frontend?\s+|backend?\s+|devops\s+)?(?:engineer|developer)\b/i,
  /\bsde[\s-]?1\b/i,
  /\bsde[\s-]?i\b/i,   // SDE I but NOT "sde in" — word boundary handles this
  /\bjr\.?\s*(?:software\s+)?(?:engineer|developer)\b/i,
  /\btrainee\s+(?:software\s+)?engineer\b/i,
  /\bmember\s+of\s+technical\s+staff\b/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — FALSE POSITIVE blocklist  (titles that match layer 1 but are NOT jobs)
// ─────────────────────────────────────────────────────────────────────────────
const FALSE_POSITIVE_PATTERNS = [
  // "International" word — most common false positive
  /\binternational\b/i,

  // "Internal" — internal job board messages, internal mobility
  /\binternal\b/i,

  // Blog/story sentences — real job titles are short, these are paragraphs
  /transitioning from an intern/i,
  /from intern to full.?time/i,
  /started at .+ as an intern/i,
  /joined .+ as an intern/i,
  /my .+ internship at/i,
  /intern to .+(engineer|manager|seller|staff)/i,
  /internship program graduate/i,
  /what it was like to .+ intern/i,
  /hosts .+ internship event/i,
  /day internship/i,
  /how .+ navigated/i,
  /rethinking leadership/i,
  /sabbatical transformed/i,
  /journey to becoming/i,

  // Blocked / error pages
  /this page is blocked/i,
  /blocked under .+ policy/i,
  /must be a .+ employee/i,
  /blue.badge employee/i,
  /requires vpn/i,
  /stable internet connection/i,
  /communication with applicants/i,
  /verifiable .+ email address/i,
  /hotmail|yahoo.com|gmail\.com.*address/i,

  // Non-job content
  /\belectricity & internet\b/i,
  /seamless international shipping/i,
  /countries and territories/i,

  // Clearly not a job title (too long — real titles are under 120 chars)
];

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — NON-TECH role exclusions
// We want SOFTWARE roles only, not HR / Marketing / Finance / Design etc.
// ─────────────────────────────────────────────────────────────────────────────
const NON_TECH_ROLE_PATTERNS = [
  // HR / People
  /\bhr\b.*intern/i,
  /\bhrbp\b.*intern/i,
  /\bhuman\s+resources?\b.*intern/i,
  /\bpeople\s+(?:ops|operations?)\b.*intern/i,
  /\btalent\s+(?:acquisition|management)\b.*intern/i,
  /\brecruiting?\b.*intern/i,
  /\blearning\s+(?:and|&)\s+development\b.*intern/i,

  // Marketing / Growth / Brand
  /\bmarketing\b.*intern/i,
  /\bdigital\s+marketing\b.*intern/i,
  /\bsocial\s+media\b.*intern/i,
  /\bcontent\b.*intern/i,
  /\bbrand\b.*intern/i,
  /\bgrowth\b.*intern/i,
  /\bseo\b.*intern/i,
  /\bsem\b.*intern/i,
  /\bperformance\s+marketing\b.*intern/i,
  /\bcopywriting\b.*intern/i,
  /\bcreative\b.*intern/i,

  // Sales / Business Dev
  /\bsales\b.*intern/i,
  /\bbusiness\s+development\b.*intern/i,
  /\bbd\b.*intern/i,
  /\baccount\s+(?:management|executive)\b.*intern/i,
  /\bcustomer\s+success\b.*intern/i,
  /\bcustomer\s+support\b.*intern/i,
  /\bpartnership\b.*intern/i,

  // Finance / Accounting
  /\bfinance\b.*intern/i,
  /\baccounting?\b.*intern/i,
  /\bchartered\s+accountant\b.*intern/i,
  /\bca\s+intern/i,
  /\baudit\b.*intern/i,
  /\btax\b.*intern/i,
  /\bfp&a\b.*intern/i,

  // Legal
  /\blegal\b.*intern/i,
  /\blaw\b.*intern/i,
  /\bcompliance\b.*intern/i,

  // Operations / Supply chain (non-tech)
  /\boperations?\b.*intern/i,
  /\bsupply\s+chain\b.*intern/i,
  /\blogistics\b.*intern/i,
  /\bwarehouse\b.*intern/i,
  /\bprocurement\b.*intern/i,

  // Design (non-engineering)
  /\bgraphic\s+design\b.*intern/i,
  /\bvisual\s+design\b.*intern/i,
  /\bmotion\s+design\b.*intern/i,
  /\billustrat\w+\b.*intern/i,
  /\bcommunication\s+design\b.*intern/i,

  // Other non-tech
  /\bpr\b.*intern/i,
  /\bpublic\s+relations\b.*intern/i,
  /\bevent\b.*intern/i,
  /\bpharmac\w+\b.*intern/i,   // pharma intern (not software)
  /\bnursing\b.*intern/i,
  /\bmedical\b.*intern/i,
  /\bclinical\b.*intern/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// TITLE QUALITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────
const MIN_TITLE_LEN = 5;
const MAX_TITLE_LEN = 120;  // Anything longer is a sentence/paragraph, not a title

/**
 * Normalize whitespace and remove zero-width chars
 */
function cleanTitle(raw) {
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u0000-\u001F]/g, " ")  // zero-width + control chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is this string even a plausible job title?
 */
function looksLikeJobTitle(title) {
  if (title.length < MIN_TITLE_LEN) return false;
  if (title.length > MAX_TITLE_LEN) return false;

  // Must not be mostly non-ASCII (binary garbage)
  const asciiRatio = (title.match(/[\x20-\x7E]/g) || []).length / title.length;
  if (asciiRatio < 0.7) return false;

  // Must not start with punctuation (not a nav link or icon)
  if (/^[→←↑↓►◄•·⚡🔥📌]/.test(title)) return false;

  // Must contain at least one English word of 3+ chars
  if (!/[a-zA-Z]{3}/.test(title)) return false;

  return true;
}

/**
 * Core match function — returns true only for real tech intern / new-grad job titles.
 *
 * @param {string} rawTitle
 * @returns {{ matched: boolean, reason?: string }}
 */
function isTargetJob(rawTitle) {
  const title = cleanTitle(rawTitle);

  // Quality gate
  if (!looksLikeJobTitle(title)) {
    return { matched: false, reason: "quality_fail" };
  }

  // Layer 1: must match a tech pattern
  const techMatch = TECH_INTERN_PATTERNS.some((p) => p.test(title));
  if (!techMatch) {
    return { matched: false, reason: "no_tech_pattern" };
  }

  // Layer 2: must not be a false positive
  const isFalsePositive = FALSE_POSITIVE_PATTERNS.some((p) => p.test(title));
  if (isFalsePositive) {
    return { matched: false, reason: "false_positive" };
  }

  // Layer 3: must not be a non-tech role
  const isNonTech = NON_TECH_ROLE_PATTERNS.some((p) => p.test(title));
  if (isNonTech) {
    return { matched: false, reason: "non_tech_role" };
  }

  return { matched: true };
}

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
