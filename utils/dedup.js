"use strict";

/**
 * dedup.js — Seen-jobs persistence layer
 *
 * TWO LEVELS OF DEDUP:
 *   1. Per-run: filterJobs() in matcher.js deduplicates within a single
 *      company's results (e.g. "SDE-I" + "SDE-I Bengaluru" = same key)
 *
 *   2. Cross-run: seen_jobs.json stores every job we have EVER alerted on.
 *      Uses TWO keys per job:
 *        a) Full ID: sha256(company|title|url) — exact match
 *        b) Title ID: sha256(normalisedTitle)  — catches same role from
 *           different company names (Niramai vs Niramai Health Analytix)
 *
 * PERSISTENCE: seen_jobs.json is committed to git after every run.
 * Do NOT use GitHub Actions cache for seen_jobs — the cache restore
 * overwrites the committed file and breaks dedup across runs.
 */

const fs   = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { normaliseForDedup } = require("./matcher");

const SEEN_FILE = process.env.SEEN_JOBS_FILE || "seen_jobs.json";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function sha16(str) {
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

/**
 * Full job fingerprint: company + normalised title + url.
 * Same job posted by two different company name variants
 * (Niramai / Niramai Health Analytix) will have different fullIds
 * but the same titleId — so titleId catches it.
 */
function makeJobId(company, title, url = "") {
  const normTitle = normaliseForDedup(title);
  const fullId    = sha16([company.toLowerCase().trim(), normTitle, url.trim()].join("|"));
  const titleId   = sha16(normTitle);  // cross-company dedup key
  return { fullId, titleId };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────────────────────────────────────

function loadSeen(filePath = SEEN_FILE) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return _fresh();
  }
  try {
    const raw  = fs.readFileSync(abs, "utf8").trim();
    if (!raw || raw === "" || raw === "{}") return _fresh();
    const data = JSON.parse(raw);
    if (!data.jobs)      data.jobs      = {};
    if (!data.titleKeys) data.titleKeys = {};
    return data;
  } catch (err) {
    console.error(`[dedup] Could not parse ${abs}: ${err.message}. Starting fresh.`);
    return _fresh();
  }
}

function _fresh() {
  return {
    _info:     "Auto-managed by scraper.js — do NOT edit manually",
    last_run:  null,
    total_seen: 0,
    jobs:      {},
    titleKeys: {},   // normalisedTitle → first seen job info
  };
}

/** Atomic write: tmp file then rename — prevents corruption on crash */
function saveSeen(data, filePath = SEEN_FILE) {
  const abs = path.resolve(filePath);
  const tmp = abs + ".tmp";

  data.last_run    = new Date().toISOString();
  data.total_seen  = Object.keys(data.jobs).length;

  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, abs);
}

// ─────────────────────────────────────────────────────────────────────────────
// IS SEEN / MARK SEEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if we have already alerted on this job.
 * Checks BOTH the full fingerprint AND the title-only key.
 */
function isSeen(jobIds, store) {
  return (
    Object.prototype.hasOwnProperty.call(store.jobs, jobIds.fullId) ||
    Object.prototype.hasOwnProperty.call(store.titleKeys, jobIds.titleId)
  );
}

/** Mark a job as seen in both indexes */
function markSeen(jobIds, jobInfo, store) {
  const record = {
    company:    jobInfo.company,
    title:      jobInfo.title,
    url:        jobInfo.url,
    category:   jobInfo.category || "",
    found_date: jobInfo.found_date || new Date().toISOString().slice(0, 10),
    seen_at:    new Date().toISOString(),
  };

  store.jobs[jobIds.fullId]          = record;
  store.titleKeys[jobIds.titleId]    = record;
}

/** Reset both indexes */
function resetSeen(filePath = SEEN_FILE) {
  const fresh = _fresh();
  saveSeen(fresh, filePath);
  return fresh;
}

module.exports = { makeJobId, loadSeen, saveSeen, isSeen, markSeen, resetSeen };
