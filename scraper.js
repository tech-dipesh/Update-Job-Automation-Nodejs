"use strict";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  India Tech Job Scraper v4                                       ║
 * ║  Node.js + Puppeteer · Nodemailer · Every 8 hours               ║
 * ║  Dipesh Gautam | dipesh77gautam@gmail.com                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node scraper.js                     full run
 *   node scraper.js --dry-run          scrape, no email
 *   node scraper.js --reset            clear seen_jobs.json
 *   node scraper.js --company "Zepto" single company test
 *   node scraper.js --list             print all companies
 *   node scraper.js --test-email       send a test email
 */

require("dotenv").config();

const fs         = require("fs");
const path       = require("path");
const https      = require("https");
const http       = require("http");
const zlib       = require("zlib");
const { URL }    = require("url");
const nodemailer = require("nodemailer");
const puppeteer  = require("puppeteer");
const { parse: parseHTML } = require("node-html-parser");

const { isTargetJob, filterJobs, cleanTitle } = require("./matcher");
const { makeJobId, loadSeen, saveSeen, isSeen, markSeen, resetSeen } = require("./dedup");
const { buildEmail } = require("./email_template");

// ═══════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════
const GMAIL_USER         = process.env.GMAIL_USER         || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const ALERT_EMAIL        = process.env.ALERT_EMAIL        || GMAIL_USER;
const COMPANIES_FILE     = process.env.COMPANIES_FILE     || "india_tech_companies.json";
const SEEN_JOBS_FILE     = process.env.SEEN_JOBS_FILE     || "seen_jobs.json";
const DELAY_MIN          = parseFloat(process.env.DELAY_MIN  || "1.5") * 1000;
const DELAY_MAX          = parseFloat(process.env.DELAY_MAX  || "4")   * 1000;
const REQ_TIMEOUT        = parseInt(process.env.REQUEST_TIMEOUT  || "20000");
const PW_TIMEOUT         = parseInt(process.env.PUPPETEER_TIMEOUT || "30000");
const MAX_RETRIES        = 3;

// ═══════════════════════════════════════════════════════════════════
//  LOGGING
// ═══════════════════════════════════════════════════════════════════
const LEVELS   = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };
const CUR_LVL  = LEVELS[(process.env.LOG_LEVEL || "INFO").toUpperCase()] ?? 1;
const logFile  = fs.createWriteStream("scraper.log", { flags: "a" });

function log(level, ...args) {
  if ((LEVELS[level] ?? 0) < CUR_LVL) return;
  const ts  = new Date().toISOString().replace("T", " ").slice(0, 19);
  const msg = `${ts}  ${level.padEnd(7)}  ${args.join(" ")}`;
  console.log(msg);
  logFile.write(msg + "\n");
}

const L = {
  debug: (...a) => log("DEBUG",   ...a),
  info:  (...a) => log("INFO",    ...a),
  warn:  (...a) => log("WARNING", ...a),
  error: (...a) => log("ERROR",   ...a),
};

// ═══════════════════════════════════════════════════════════════════
//  USER AGENTS
// ═══════════════════════════════════════════════════════════════════
const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
];

const randUA  = () => UAS[Math.floor(Math.random() * UAS.length)];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));

function baseHeaders() {
  return {
    "User-Agent":                randUA(),
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":           "en-US,en;q=0.9,hi;q=0.8",
    "Accept-Encoding":           "gzip, deflate, br",
    "Connection":                "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest":            "document",
    "Sec-Fetch-Mode":            "navigate",
    "Sec-Fetch-Site":            "none",
    "Sec-Fetch-User":            "?1",
    "Cache-Control":             "max-age=0",
    "DNT":                       "1",
  };
}

// ═══════════════════════════════════════════════════════════════════
//  HTTP FETCH  (native Node — no axios needed)
// ═══════════════════════════════════════════════════════════════════
function fetchUrl(rawUrl, timeoutMs = REQ_TIMEOUT) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(rawUrl); } catch { return resolve({ ok: false, status: 0, body: null }); }

    const lib     = parsed.protocol === "https:" ? https : http;
    const options = {
      hostname:           parsed.hostname,
      port:               parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:               parsed.pathname + parsed.search,
      method:             "GET",
      headers:            baseHeaders(),
      timeout:            timeoutMs,
      rejectUnauthorized: false,
    };

    let body = "";

    const req = lib.request(options, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        try {
          const next = new URL(res.headers.location, rawUrl).href;
          return resolve(fetchUrl(next, timeoutMs));
        } catch {
          return resolve({ ok: false, status: res.statusCode, body: null });
        }
      }

      if (res.statusCode === 429 || res.statusCode === 503) {
        return resolve({ ok: false, status: res.statusCode, body: null });
      }
      if (res.statusCode < 200 || res.statusCode >= 400) {
        return resolve({ ok: false, status: res.statusCode, body: null });
      }

      const enc = res.headers["content-encoding"] || "";
      let stream = res;
      if (enc.includes("br"))              stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc.includes("gzip"))       stream = res.pipe(zlib.createGunzip());
      else if (enc.includes("deflate"))    stream = res.pipe(zlib.createInflate());

      stream.setEncoding("utf8");
      stream.on("data",  (c) => { body += c; });
      stream.on("end",   ()  => resolve({ ok: true, status: res.statusCode, body }));
      stream.on("error", ()  => resolve({ ok: false, status: 0, body: null }));
    });

    req.on("error",   () => resolve({ ok: false, status: 0,   body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 408, body: null }); });
    req.end();
  });
}

async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetchUrl(url);
    if (res.ok) return res.body;
    if (res.status === 404 || res.status === 410) return null;
    if (res.status === 429 || res.status === 503) {
      await sleep((2 ** attempt) * 1000 + randInt(500, 2000));
      continue;
    }
    await sleep(randInt(1500, 3500) * attempt);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  ATS JSON APIs
// ═══════════════════════════════════════════════════════════════════
async function fetchJson(url) {
  const body = await fetchWithRetry(url);
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

async function greenhouseJobs(url) {
  const m = url.match(/boards\.greenhouse\.io\/([^/?#\s]+)/);
  if (!m) return null;
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs?content=true`);
  if (!data?.jobs) return null;
  return data.jobs.map((j) => ({ title: j.title || "", url: j.absolute_url || "" }));
}

async function leverJobs(url) {
  const m = url.match(/jobs\.lever\.co\/([^/?#\s]+)/);
  if (!m) return null;
  const data = await fetchJson(`https://api.lever.co/v0/postings/${m[1]}?mode=json`);
  if (!Array.isArray(data)) return null;
  return data.map((j) => ({ title: j.text || "", url: j.hostedUrl || "" }));
}

async function smartrecruitersJobs(url) {
  const m = url.match(/careers\.smartrecruiters\.com\/([^/?#\s]+)/);
  if (!m) return null;
  const data = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${m[1]}/postings?limit=100`);
  if (!data?.content) return null;
  return data.content.map((j) => ({ title: j.name || "", url: j.ref || "" }));
}

// ═══════════════════════════════════════════════════════════════════
//  HTML PARSER
// ═══════════════════════════════════════════════════════════════════
const ATS_SELECTORS = [
  "[class*='opening']",       "[class*='job-title']",   "[class*='job_title']",
  "[class*='posting-title']", "[class*='posting-name']",
  "[data-automation-id='jobPostingTitle']",
  "[class*='jobTitle']",      "[class*='position-title']",
  "[class*='role-title']",    "[class*='career-title']",
  "[class*='listing-title']", "[class*='vacancy-title']",
  "[class*='opportunity-title']", "[class*='job-listing']",
];

function extractJobsFromHtml(html, baseUrl = "") {
  const root   = parseHTML(html);
  const rawSet = new Set();

  function resolveHref(href) {
    if (!href) return "";
    if (href.startsWith("http")) return href;
    if (href.startsWith("javascript:")) return "";
    try { return new URL(href, baseUrl).href; } catch { return ""; }
  }

  function add(title, url = "") {
    const t = cleanTitle(title);
    if (!t) return;
    rawSet.add(JSON.stringify({ title: t, url }));
  }

  for (const sel of ATS_SELECTORS) {
    try {
      root.querySelectorAll(sel).forEach((el) => {
        add(el.innerText, resolveHref(el.getAttribute("href") || ""));
      });
    } catch {}
  }

  root.querySelectorAll("a[href]").forEach((a) => {
    add(a.innerText, resolveHref(a.getAttribute("href") || ""));
  });

  root.querySelectorAll("h1,h2,h3,h4").forEach((h) => {
    const parent = h.closest("a");
    add(h.innerText, resolveHref(parent?.getAttribute("href") || ""));
  });

  root.text.split("\n").forEach((line) => {
    const t = cleanTitle(line);
    if (t.length >= 4 && t.length <= 100) add(t);
  });

  return filterJobs(Array.from(rawSet).map((s) => JSON.parse(s)));
}

// ═══════════════════════════════════════════════════════════════════
//  PUPPETEER (headless Chrome, stealth)
// ═══════════════════════════════════════════════════════════════════
const PW_DOMAINS = new Set([
  "careers.google.com", "careers.microsoft.com", "www.amazon.jobs",
  "www.metacareers.com", "jobs.apple.com", "careers.linkedin.com",
  "careers.snap.com", "careers.uber.com", "careers.jpmorgan.com",
  "www.goldmansachs.com", "careers.servicenow.com",
]);

function needsPuppeteer(url) {
  try {
    const { hostname } = new URL(url);
    return (
      PW_DOMAINS.has(hostname)         ||
      hostname.includes("workday")     ||
      hostname.includes("myworkdayjobs") ||
      hostname.includes("greenhouse.io") ||
      hostname.includes("lever.co")
    );
  } catch { return false; }
}

const STEALTH = `
  Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
  Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
  Object.defineProperty(navigator,'languages',{get:()=>['en-US','en','hi']});
  window.chrome={runtime:{}};
`;

const BLOCK_TYPES = ["image", "media", "font", "stylesheet"];
const BLOCK_URLS  = /ads\.|analytics\.|hotjar\.|segment\.|sentry\.|\.png$|\.jpg$|\.gif$|\.svg$|\.woff/;

async function fetchWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--window-size=1366,768",
      ],
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(STEALTH);
    await page.setUserAgent(randUA());
    await page.setViewport({ width: randInt(1280, 1920), height: randInt(700, 1080) });
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9", "DNT": "1" });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (BLOCK_TYPES.includes(req.resourceType()) || BLOCK_URLS.test(req.url()))
        req.abort();
      else
        req.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT });

    // Human-like scroll
    await page.evaluate(async () => {
      await new Promise((r) => {
        let n = 0;
        const s = () => { window.scrollBy(0, Math.random() * 250 + 100); if (++n < 5) setTimeout(s, 300); else r(); };
        s();
      });
    });

    await sleep(randInt(1500, 3000));
    const html = await page.content();
    await browser.close();
    return html;
  } catch (err) {
    L.debug(`  Puppeteer error: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PER-COMPANY SCRAPE
// ═══════════════════════════════════════════════════════════════════
async function scrapeCompany(company) {
  const { name, careers_url: url, category } = company;
  L.info(`🔍  ${name.padEnd(42)} ${url.slice(0, 60)}`);

  let rawJobs = null;

  // 1. ATS JSON APIs (fastest, most reliable)
  for (const fn of [greenhouseJobs, leverJobs, smartrecruitersJobs]) {
    rawJobs = await fn(url);
    if (rawJobs !== null) { L.debug(`  ↳ API (${fn.name})`); break; }
  }

  // 2. HTTP fetch
  if (rawJobs === null) {
    let html = null;

    if (!needsPuppeteer(url)) {
      html = await fetchWithRetry(url);
    }

    // 3. Puppeteer fallback
    if (!html) {
      L.debug(`  ↳ Puppeteer`);
      html = await fetchWithPuppeteer(url);
    }

    if (!html) {
      L.warn(`  ✗  Could not fetch: ${name}`);
      return [];
    }

    rawJobs = extractJobsFromHtml(html, url);
  }

  // filterJobs already applied in extractJobsFromHtml,
  // but API results need it too
  const matched = filterJobs(rawJobs.map((j) => ({ ...j, url: j.url || url })));

  if (matched.length) {
    L.info(`  ✅  ${matched.length} match(es) at ${name}`);
    matched.forEach((j) => L.info(`       • ${j.title}`));
  }

  return matched.map((j) => ({
    company:    name,
    category:   category || "",
    title:      j.title,
    url:        j.url || url,
    found_date: new Date().toISOString().slice(0, 10),
  }));
}

// ═══════════════════════════════════════════════════════════════════
//  EMAIL
// ═══════════════════════════════════════════════════════════════════
async function sendAlert(newJobs, dryRun = false) {
  if (!newJobs.length) { L.info("No new jobs — email skipped."); return; }

  const { subject, html, text } = buildEmail(newJobs);

  if (dryRun) {
    L.info(`[DRY-RUN] "${subject}"`);
    console.log(`\n${"═".repeat(64)}\nDRY-RUN — ${newJobs.length} jobs:\n`);
    newJobs.forEach((j) => console.log(`  [${j.company}]  ${j.title}\n  ${j.url}\n`));
    console.log("═".repeat(64) + "\n");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    const info = await transporter.sendMail({
      from:    `"Job Alert Bot 🚀" <${GMAIL_USER}>`,
      to:      ALERT_EMAIL,
      subject, text, html,
    });
    L.info(`✉️  Email sent → ${ALERT_EMAIL}  (${newJobs.length} jobs)  ${info.messageId}`);
  } catch (err) {
    L.error(`❌  Email error: ${err.message}`);
    if (err.message.includes("Invalid login") || err.message.includes("Username and Password"))
      L.error("    → Use Gmail App Password (not your main password)");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  LOAD COMPANIES
// ═══════════════════════════════════════════════════════════════════
function loadCompanies() {
  const abs = path.resolve(COMPANIES_FILE);
  if (!fs.existsSync(abs)) { L.error(`Companies file not found: ${abs}`); process.exit(1); }
  const raw  = JSON.parse(fs.readFileSync(abs, "utf8"));
  const list = Array.isArray(raw) ? raw : (raw.companies || []);
  L.info(`Loaded ${list.length} companies from ${COMPANIES_FILE}`);
  return list;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RUN
// ═══════════════════════════════════════════════════════════════════
async function run({ dryRun = false, targetCompany = null } = {}) {
  const t0  = Date.now();

  L.info("═".repeat(64));
  L.info(`  India Job Scraper v4 — ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
  L.info("═".repeat(64));

  let companies = loadCompanies();
  const store   = loadSeen(SEEN_JOBS_FILE);
  const newJobs = [];
  let errors    = 0;
  let dups      = 0;

  if (targetCompany) {
    companies = companies.filter((c) =>
      c.name.toLowerCase().includes(targetCompany.toLowerCase())
    );
    if (!companies.length) { L.error(`No company matching "${targetCompany}"`); return; }
    L.info(`Filtered to ${companies.length} company(ies) matching "${targetCompany}"`);
  }

  L.info(`Companies to scrape : ${companies.length}`);
  L.info(`Already tracked     : ${store.total_seen} jobs`);
  L.info(`Dry run             : ${dryRun}`);
  L.info("─".repeat(64));

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    L.info(`[${String(i + 1).padStart(3)}/${companies.length}]`);

    let jobs = [];
    try {
      jobs = await scrapeCompany(company);
    } catch (err) {
      L.error(`  💥  ${company.name}: ${err.message}`);
      errors++;
    }

    for (const job of jobs) {
      // ── makeJobId returns { fullId, titleId } ──
      const ids = makeJobId(
        job.company,   // plain string — already resolved above
        job.title,
        job.url
      );

      if (!isSeen(ids, store)) {
        newJobs.push(job);
        markSeen(ids, job, store);
        L.info(`  🆕  NEW: ${job.title}  [${job.company}]`);
      } else {
        dups++;
        L.debug(`  dup skipped: ${job.title}`);
      }
    }

    // ── Save after every company (crash-safe) ──────────────────
    saveSeen(store, SEEN_JOBS_FILE);

    if (i < companies.length - 1) {
      await sleep(randInt(DELAY_MIN, DELAY_MAX));
    }
  }

  const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
  L.info("─".repeat(64));
  L.info(`Done in ${elapsed} min  |  New: ${newJobs.length}  |  Dups skipped: ${dups}  |  Errors: ${errors}`);
  L.info(`seen_jobs.json now has ${Object.keys(store.jobs).length} entries`);
  L.info("═".repeat(64));

  await sendAlert(newJobs, dryRun);

  if (newJobs.length) {
    console.log(`\n🎉  ${newJobs.length} new job(s) found!\n`);
    newJobs.forEach((j) => console.log(`  [${j.company}]  ${j.title}\n  ${j.url}\n`));
  } else {
    console.log(`\n😴  No new jobs this run.\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CLI
// ═══════════════════════════════════════════════════════════════════
(async () => {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const opt  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

  if (flag("--list")) {
    loadCompanies().forEach((c) => console.log(`  ${c.name.padEnd(45)}  ${c.careers_url}`));
    return;
  }

  if (flag("--reset")) {
    resetSeen(SEEN_JOBS_FILE);
    L.info("✅  seen_jobs.json cleared.");
    if (!flag("--run")) return;
  }

  if (flag("--test-email")) {
    await sendAlert([{
      company:    "Test Company (Scaler Academy)",
      category:   "Indian Product Startup",
      title:      "Software Engineering Intern — Summer 2026",
      url:        "https://example.com/apply",
      found_date: new Date().toISOString().slice(0, 10),
    }], false);
    return;
  }

  await run({
    dryRun:        flag("--dry-run"),
    targetCompany: opt("--company"),
  });

  process.exit(0);
})();
