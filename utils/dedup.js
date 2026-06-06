"use strict";

/**
 * dedup.js — Cross-run seen-jobs tracker
 *
 * TWO FINGERPRINTS per job:
 *   fullId  = sha256(company + normalisedTitle + url)  → exact match
 *   titleId = sha256(normalisedTitle)                  → cross-company match
 *             e.g. "Niramai" vs "Niramai Health Analytix" posting same "ML Intern"
 *             → same titleId → blocked
 *
 * PERSISTENCE:
 *   Writes seen_jobs.json after every company (crash-safe).
 *   Committed to git by GitHub Actions after every run.
 *   NO cache restore — cache overwrites the committed file and breaks dedup.
 */

const fs   = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { normaliseForDedup } = require("./matcher");

const SEEN_FILE = process.env.SEEN_JOBS_FILE || "seen_jobs.json";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function sha16(str) {
  return createHash("sha256").update(String(str)).digest("hex").slice(0, 16);
}

/**
 * Returns { fullId, titleId } — both are plain strings.
 *
 * fullId:  unique to (company + title + url)
 * titleId: unique to normalised title only — catches cross-company dups
 */
function makeJobId(company, title, url = "") {
  const norm    = normaliseForDedup(title);
  const fullId  = sha16([company.toLowerCase().trim(), norm, url.trim()].join("|"));
  const titleId = sha16(norm);
  return { fullId, titleId };
}

// ─── LOAD / SAVE ─────────────────────────────────────────────────────────────

function _fresh() {
  return {
    _info:      "Auto-managed by scraper.js — do NOT edit manually",
    last_run:   null,
    total_seen: 0,
    jobs:       {},       // fullId  → job record
    titleKeys:  {},       // titleId → job record  (cross-company dedup)
  };
}

function loadSeen(filePath = SEEN_FILE) {
  const abs = path.resolve(filePath);

  if (!fs.existsSync(abs)) return _fresh();

  try {
    const raw = fs.readFileSync(abs, "utf8").trim();
    if (!raw || raw === "{}" || raw.length < 10) return _fresh();

    const data = JSON.parse(raw);
    if (!data.jobs)      data.jobs      = {};
    if (!data.titleKeys) data.titleKeys = {};
    return data;
  } catch (err) {
    console.error(`[dedup] Could not parse ${filePath}: ${err.message}. Starting fresh.`);
    return _fresh();
  }
}

/** Atomic write — prevents corruption if the process is killed mid-write */
function saveSeen(data, filePath = SEEN_FILE) {
  const abs = path.resolve(filePath);
  const tmp = abs + ".tmp";

  data.last_run   = new Date().toISOString();
  data.total_seen = Object.keys(data.jobs).length;

  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, abs);
}

// ─── IS SEEN / MARK SEEN ─────────────────────────────────────────────────────

/**
 * @param {{ fullId: string, titleId: string }} ids
 * @param {object} store
 * @returns {boolean}
 */
function isSeen(ids, store) {
  return (
    Object.prototype.hasOwnProperty.call(store.jobs,      ids.fullId)  ||
    Object.prototype.hasOwnProperty.call(store.titleKeys, ids.titleId)
  );
}

/**
 * @param {{ fullId: string, titleId: string }} ids
 * @param {object} jobInfo
 * @param {object} store
 */
function markSeen(ids, jobInfo, store) {
  const record = {
    company:    String(jobInfo.company    || ""),
    title:      String(jobInfo.title      || ""),
    url:        String(jobInfo.url        || ""),
    category:   String(jobInfo.category   || ""),
    found_date: jobInfo.found_date || new Date().toISOString().slice(0, 10),
    seen_at:    new Date().toISOString(),
  };
  store.jobs[ids.fullId]          = record;
  store.titleKeys[ids.titleId]    = record;
}

function resetSeen(filePath = SEEN_FILE) {
  const fresh = _fresh();
  saveSeen(fresh, filePath);
  console.log(`[dedup] seen_jobs.json reset at ${filePath}`);
  return fresh;
}

module.exports = { makeJobId, loadSeen, saveSeen, isSeen, markSeen, resetSeen };
