"use strict";

/**
 * dedup.js — Seen-jobs persistence layer
 *
 * Stores a SHA-256 fingerprint (16 hex chars) for every job we have
 * already alerted on.  On the next run, any job already in the store
 * is silently skipped.
 *
 * File format (seen_jobs.json):
 * {
 *   "_info": "...",
 *   "last_run": "ISO timestamp",
 *   "total_seen": 95,
 *   "jobs": {
 *     "abc123def456789a": {
 *       "company": "...",
 *       "title": "...",
 *       "url": "...",
 *       "seen_at": "ISO timestamp"
 *     }
 *   }
 * }
 */

const fs   = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const SEEN_FILE = process.env.SEEN_JOBS_FILE || "seen_jobs.json";

/**
 * Stable fingerprint for a job.
 * Normalises company + title + url to be whitespace/case insensitive.
 */
function makeJobId(company, title, url = "") {
  const raw = [
    company.toLowerCase().trim(),
    title.toLowerCase().replace(/\s+/g, " ").trim(),
    (url || "").trim(),
  ].join("|");

  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Load seen_jobs.json, or return a blank store if it doesn't exist. */
function loadSeen(filePath = SEEN_FILE) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return {
      _info: "Auto-managed by scraper.js — do NOT edit manually",
      last_run: null,
      total_seen: 0,
      jobs: {},
    };
  }
  try {
    const raw = fs.readFileSync(abs, "utf8");
    const data = JSON.parse(raw);
    // Ensure jobs key always exists
    if (!data.jobs) data.jobs = {};
    return data;
  } catch (err) {
    console.error(`[dedup] Could not parse ${abs}: ${err.message}. Starting fresh.`);
    return {
      _info: "Auto-managed by scraper.js — do NOT edit manually",
      last_run: null,
      total_seen: 0,
      jobs: {},
    };
  }
}

/** Persist seen_jobs.json atomically (write to tmp, then rename). */
function saveSeen(data, filePath = SEEN_FILE) {
  const abs   = path.resolve(filePath);
  const tmp   = abs + ".tmp";

  data.last_run   = new Date().toISOString();
  data.total_seen = Object.keys(data.jobs).length;

  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, abs);
}

/** Check if a job has already been seen. */
function isSeen(jobId, store) {
  return Object.prototype.hasOwnProperty.call(store.jobs, jobId);
}

/** Mark a job as seen (mutates store in-place). */
function markSeen(jobId, jobInfo, store) {
  store.jobs[jobId] = {
    company:    jobInfo.company,
    title:      jobInfo.title,
    url:        jobInfo.url,
    category:   jobInfo.category || "",
    found_date: jobInfo.found_date || new Date().toISOString().slice(0, 10),
    seen_at:    new Date().toISOString(),
  };
}

/** Reset the store (used by --reset flag). */
function resetSeen(filePath = SEEN_FILE) {
  const fresh = {
    _info: "Auto-managed by scraper.js — do NOT edit manually",
    last_run: null,
    total_seen: 0,
    jobs: {},
  };
  saveSeen(fresh, filePath);
  return fresh;
}

module.exports = { makeJobId, loadSeen, saveSeen, isSeen, markSeen, resetSeen };
