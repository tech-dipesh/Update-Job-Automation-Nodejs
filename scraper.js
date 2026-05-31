"use strict";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   India Tech Job Scraper v3 — Node.js + Puppeteer               ║
 * ║   Dipesh Gautam | dipesh77gautam@gmail.com                      ║
 * ║   Monitors 500+ career pages · Emails only NEW tech intern jobs  ║
 * ║   Runs every 3 hours via GitHub Actions (zero maintenance)       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node scraper.js                        # full run
 *   node scraper.js --dry-run             # scrape, no email
 *   node scraper.js --reset               # clear seen_jobs.json
 *   node scraper.js --company "Google"    # single company test
 *   node scraper.js --list                # print all companies
 *   node scraper.js --test-email          # send a test email
 */

require("dotenv").config();

const fs          = require("fs");
const path        = require("path");
const https       = require("https");
const http        = require("http");
const { URL }     = require("url");
const nodemailer  = require("nodemailer");
const puppeteer   = require("puppeteer");
const { parse: parseHTML } = require("node-html-parser");

const { isTargetJob, filterJobs, cleanTitle } = require("./utils/matcher");
const { makeJobId, loadSeen, saveSeen, isSeen, markSeen, resetSeen } = require("./utils/dedup");
const { buildEmail } = require("./email_template");

// ═══════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════
const GMAIL_USER          = process.env.GMAIL_USER         || "";
const GMAIL_APP_PASSWORD  = process.env.GMAIL_APP_PASSWORD || "";
const ALERT_EMAIL         = process.env.ALERT_EMAIL        || GMAIL_USER;
const COMPANIES_FILE      = process.env.COMPANIES_FILE     || "india_tech_companies.json";
const SEEN_JOBS_FILE      = process.env.SEEN_JOBS_FILE     || "seen_jobs.json";
const DELAY_MIN           = parseFloat(process.env.DELAY_MIN || "1.5") * 1000;  // ms
const DELAY_MAX           = parseFloat(process.env.DELAY_MAX || "4")   * 1000;
const REQUEST_TIMEOUT_MS  = parseInt(process.env.REQUEST_TIMEOUT || "20000");
const PUPPETEER_TIMEOUT   = parseInt(process.env.PUPPETEER_TIMEOUT || "30000");
const MAX_RETRIES         = 3;

// ═══════════════════════════════════════════════════════════════════
//  LOGGING
// ═══════════════════════════════════════════════════════════════════
const LOG_LEVEL = process.env.LOG_LEVEL || "INFO";
const LEVELS    = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };
const curLevel  = LEVELS[LOG_LEVEL.toUpperCase()] ?? 1;
const logStream = fs.createWriteStream("scraper.log", { flags: "a" });

function log(level, ...args) {
  if ((LEVELS[level] ?? 0) < curLevel) return;
  const ts  = new Date().toISOString().replace("T", " ").slice(0, 19);
  const msg = `${ts}  ${level.padEnd(7)}  ${args.join(" ")}`;
  console.log(msg);
  logStream.write(msg + "\n");
}

const logger = {
  debug:   (...a) => log("DEBUG",   ...a),
  info:    (...a) => log("INFO",    ...a),
  warn:    (...a) => log("WARNING", ...a),
  error:   (...a) => log("ERROR",   ...a),
};

// ═══════════════════════════════════════════════════════════════════
//  USER AGENTS  (rotate per request)
// ═══════════════════════════════════════════════════════════════════
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
];

function randUA()  { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
//  HTTP FETCH  (native Node https, no axios needed)
// ═══════════════════════════════════════════════════════════════════
function fetchUrl(rawUrl, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const parsed = new URL(rawUrl);
    const lib    = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "GET",
      headers:  baseHeaders(),
      timeout:  timeoutMs,
      rejectUnauthorized: false,   // some Indian startup sites have dodgy certs
    };

    let body = "";
    const req = lib.request(options, (res) => {
      // Follow redirects (max 5)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, rawUrl).href;
        resolve(fetchUrl(next, timeoutMs));
        return;
      }

      if (res.statusCode === 429 || res.statusCode === 503) {
        resolve({ ok: false, status: res.statusCode, body: null });
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 400) {
        resolve({ ok: false, status: res.statusCode, body: null });
        return;
      }

      // Handle gzip
      let stream = res;
      const enc  = res.headers["content-encoding"] || "";
      if (enc.includes("gzip") || enc.includes("deflate")) {
        const zlib = require("zlib");
        stream     = res.pipe(zlib.createGunzip());
      } else if (enc.includes("br")) {
        const zlib = require("zlib");
        stream     = res.pipe(zlib.createBrotliDecompress());
      }

      stream.setEncoding("utf8");
      stream.on("data", (chunk) => { body += chunk; });
      stream.on("end",  () => resolve({ ok: true, status: res.statusCode, body }));
      stream.on("error",() => resolve({ ok: false, status: 0, body: null }));
    });

    req.on("error",   () => resolve({ ok: false, status: 0, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 408, body: null }); });
    req.end();
  });
}

/** Retry fetchUrl with exponential backoff */
async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetchUrl(url);
    if (res.ok) return res.body;

    if (res.status === 404 || res.status === 410) return null;   // gone — don't retry

    if (res.status === 429 || res.status === 503) {
      const wait = (2 ** attempt) * 1000 + randInt(500, 2000);
      logger.debug(`  HTTP ${res.status} — retry ${attempt}/${MAX_RETRIES} in ${wait}ms`);
      await sleep(wait);
      continue;
    }

    logger.debug(`  HTTP ${res.status} attempt ${attempt}/${MAX_RETRIES}`);
    await sleep(randInt(1500, 3500) * attempt);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  ATS JSON APIs  (fastest path — structured data, no HTML parsing)
// ═══════════════════════════════════════════════════════════════════

async function fetchJson(url) {
  const body = await fetchWithRetry(url);
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

/** Greenhouse boards API */
async function greenhouseJobs(careersUrl) {
  const m = careersUrl.match(/boards\.greenhouse\.io\/([^/?#\s]+)/);
  if (!m) return null;
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs?content=true`);
  if (!data?.jobs) return null;
  return data.jobs.map((j) => ({ title: j.title || "", url: j.absolute_url || "" }));
}

/** Lever API */
async function leverJobs(careersUrl) {
  const m = careersUrl.match(/jobs\.lever\.co\/([^/?#\s]+)/);
  if (!m) return null;
  const data = await fetchJson(`https://api.lever.co/v0/postings/${m[1]}?mode=json`);
  if (!Array.isArray(data)) return null;
  return data.map((j) => ({ title: j.text || "", url: j.hostedUrl || "" }));
}

/** Ashby */
async function ashbyJobs(careersUrl) {
  const m = careersUrl.match(/jobs\.ashbyhq\.com\/([^/?#\s]+)/);
  if (!m) return null;
  const body = await fetchWithRetry(
    "https://api.ashbyhq.com/posting-api/job-board"
  );
  // POST is not trivial with native https — skip for now; HTML parse handles it
  return null;
}

/** SmartRecruiters */
async function smartrecruitersJobs(careersUrl) {
  const m = careersUrl.match(/careers\.smartrecruiters\.com\/([^/?#\s]+)/);
  if (!m) return null;
  const data = await fetchJson(
    `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings?limit=100`
  );
  if (!data?.content) return null;
  return data.content.map((j) => ({ title: j.name || "", url: j.ref || "" }));
}

// ═══════════════════════════════════════════════════════════════════
//  HTML PARSER  (node-html-parser — faster than cheerio, no DOM)
// ═══════════════════════════════════════════════════════════════════
const ATS_SELECTORS = [
  "[class*='opening']",     "[class*='job-title']",   "[class*='job_title']",
  "[class*='posting-title']","[class*='posting-name']",
  "[data-automation-id='jobPostingTitle']",
  "[class*='jobTitle']",    "[class*='position-title']",
  "[class*='role-title']",  "[class*='career-title']",
  "[class*='listing-title']","[class*='vacancy-title']",
  "[class*='opportunity-title']", "[class*='job-listing']",
];

function extractJobsFromHtml(html, baseUrl = "") {
  const root   = parseHTML(html);
  const rawSet = new Set();  // dedup by (title,url) key

  function add(title, url = "") {
    const t = cleanTitle(title);
    if (!t) return;
    const k = t.toLowerCase() + "|" + url;
    rawSet.add(JSON.stringify({ title: t, url }));
  }

  function resolveHref(href) {
    if (!href) return "";
    if (href.startsWith("http")) return href;
    if (href.startsWith("javascript:")) return "";
    try { return new URL(href, baseUrl).href; } catch { return ""; }
  }

  // Selector-based
  for (const sel of ATS_SELECTORS) {
    try {
      root.querySelectorAll(sel).forEach((el) => {
        const txt  = el.innerText;
        const href = resolveHref(el.getAttribute("href") || "");
        add(txt, href);
      });
    } catch {}
  }

  // All anchor tags
  root.querySelectorAll("a[href]").forEach((a) => {
    const txt  = a.innerText;
    const href = resolveHref(a.getAttribute("href") || "");
    add(txt, href);
  });

  // Headings
  root.querySelectorAll("h1,h2,h3,h4").forEach((h) => {
    const txt    = h.innerText;
    const parent = h.closest("a");
    const href   = resolveHref(parent?.getAttribute("href") || "");
    add(txt, href);
  });

  // Line-by-line text scan (last resort)
  root.text.split("\n").forEach((line) => {
    const t = cleanTitle(line);
    if (t.length >= 5 && t.length <= 120) add(t);
  });

  const jobs = Array.from(rawSet).map((s) => JSON.parse(s));
  return filterJobs(jobs);
}

// ═══════════════════════════════════════════════════════════════════
//  PUPPETEER (headless Chrome — for JS-heavy / bot-blocking sites)
// ═══════════════════════════════════════════════════════════════════
const PUPPETEER_DOMAINS = new Set([
  "careers.google.com",
  "careers.microsoft.com",
  "www.amazon.jobs",
  "amazon.jobs",
  "www.metacareers.com",
  "metacareers.com",
  "jobs.apple.com",
  "careers.linkedin.com",
  "linkedin.com",
  "careers.snap.com",
  "careers.uber.com",
  "careers.jpmorgan.com",
  "www.goldmansachs.com",
  "goldmansachs.com",
  "careers.servicenow.com",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "salesforce.wd1.myworkdayjobs.com",
  "careers.salesforce.com",
]);

function needsPuppeteer(url) {
  try {
    const { hostname } = new URL(url);
    return (
      PUPPETEER_DOMAINS.has(hostname) ||
      hostname.includes("workday") ||
      hostname.includes("myworkdayjobs") ||
      hostname.includes("greenhouse.io") ||
      hostname.includes("lever.co")
    );
  } catch {
    return false;
  }
}

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins',   { get: () => [1,2,3,4,5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en','hi'] });
  window.chrome = { runtime: {} };
  Object.defineProperty(navigator, 'permissions', {
    get: () => ({
      query: (p) => p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : Promise.resolve({ state: 'granted' }),
    }),
  });
`;

const BLOCK_RESOURCE_TYPES = ["image", "media", "font", "stylesheet"];
const BLOCK_URL_PATTERNS   = [
  /ads\.|analytics\.|hotjar\.|segment\.|sentry\.|newrelic\./,
  /\.png$|\.jpg$|\.gif$|\.svg$|\.woff2?$/,
];

async function fetchWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--window-size=1366,768",
      ],
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(STEALTH_SCRIPT);
    await page.setUserAgent(randUA());
    await page.setViewport({ width: randInt(1280, 1920), height: randInt(700, 1080) });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
      "DNT": "1",
    });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        BLOCK_RESOURCE_TYPES.includes(req.resourceType()) ||
        BLOCK_URL_PATTERNS.some((p) => p.test(req.url()))
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout:   PUPPETEER_TIMEOUT,
    });

    // Human-like scroll
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let n = 0;
        const step = () => {
          window.scrollBy(0, Math.random() * 250 + 100);
          if (++n < 5) setTimeout(step, Math.random() * 400 + 200);
          else resolve();
        };
        step();
      });
    });

    await sleep(randInt(1500, 3000));
    const html = await page.content();
    await browser.close();
    return html;
  } catch (err) {
    logger.debug(`  Puppeteer error: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PER-COMPANY SCRAPE
// ═══════════════════════════════════════════════════════════════════
async function scrapeCompany(company) {
  const { name, careers_url: url, category } = company;
  logger.info(`🔍  ${name.padEnd(40)}  ${url.slice(0, 65)}`);

  let rawJobs = null;

  // ── 1. Try ATS JSON APIs first (no HTML needed, cleanest data) ──
  for (const apiFn of [greenhouseJobs, leverJobs, smartrecruitersJobs]) {
    rawJobs = await apiFn(url);
    if (rawJobs !== null) {
      logger.debug(`  ↳ API hit (${apiFn.name}) → ${rawJobs.length} total jobs`);
      break;
    }
  }

  // ── 2. Fetch HTML ──────────────────────────────────────────────
  if (rawJobs === null) {
    let html = null;

    if (needsPuppeteer(url)) {
      logger.debug(`  ↳ Puppeteer (JS-heavy site)`);
      html = await fetchWithPuppeteer(url);
    } else {
      html = await fetchWithRetry(url);
    }

    // If requests failed, fall back to Puppeteer
    if (!html && !needsPuppeteer(url)) {
      logger.debug(`  ↳ requests failed, trying Puppeteer fallback`);
      html = await fetchWithPuppeteer(url);
    }

    if (!html) {
      logger.warn(`  ✗  Could not fetch: ${name}`);
      return [];
    }

    rawJobs = extractJobsFromHtml(html, url);
  }

  // filterJobs is already applied in extractJobsFromHtml,
  // but for API results run it here
  const matched = filterJobs(
    rawJobs.map((j) => ({ ...j, url: j.url || url }))
  );

  if (matched.length) {
    logger.info(`  ✅  ${matched.length} match(es)  →  ${name}`);
    matched.forEach((j) => logger.info(`       • ${j.title}`));
  }

  return matched.map((j) => ({
    company,
    category:   category || "",
    title:      j.title,
    url:        j.url || url,
    found_date: new Date().toISOString().slice(0, 10),
  }));
}

// ═══════════════════════════════════════════════════════════════════
//  EMAIL SENDER
// ═══════════════════════════════════════════════════════════════════
async function sendAlert(newJobs, dryRun = false) {
  if (newJobs.length === 0) {
    logger.info("No new jobs — email skipped.");
    return;
  }

  const { subject, html, text } = buildEmail(newJobs);

  if (dryRun) {
    logger.info(`[DRY-RUN] Would send: "${subject}"`);
    console.log(`\n${"═".repeat(64)}`);
    console.log(`DRY-RUN — ${newJobs.length} jobs would be emailed:\n`);
    newJobs.forEach((j) => {
      console.log(`  [${j.company}]  ${j.title}`);
      console.log(`  ${j.url}\n`);
    });
    console.log("═".repeat(64) + "\n");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from:    `"Job Alert Bot" <${GMAIL_USER}>`,
      to:      ALERT_EMAIL,
      subject,
      text,
      html,
    });
    logger.info(`✉️  Email sent → ${ALERT_EMAIL}  (${newJobs.length} jobs)  msgId: ${info.messageId}`);
  } catch (err) {
    logger.error(`❌  Email failed: ${err.message}`);
    if (err.message.includes("Invalid login") || err.message.includes("Username and Password")) {
      logger.error("    → Check GMAIL_APP_PASSWORD in .env (use App Password, not main password)");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  LOAD COMPANIES
// ═══════════════════════════════════════════════════════════════════
function loadCompanies() {
  const abs = path.resolve(COMPANIES_FILE);
  if (!fs.existsSync(abs)) {
    logger.error(`Companies file not found: ${abs}`);
    process.exit(1);
  }
  const raw  = JSON.parse(fs.readFileSync(abs, "utf8"));
  const list = Array.isArray(raw) ? raw : (raw.companies || []);
  logger.info(`Loaded ${list.length} companies from ${COMPANIES_FILE}`);
  return list;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RUN
// ═══════════════════════════════════════════════════════════════════
async function run({ dryRun = false, targetCompany = null } = {}) {
  const startMs = Date.now();
  logger.info("═".repeat(64));
  logger.info(`  India Job Scraper v3 — ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
  logger.info("═".repeat(64));

  let companies = loadCompanies();
  const store   = loadSeen(SEEN_JOBS_FILE);
  const newJobs = [];
  let   errors  = 0;
  let   dupsSkipped = 0;

  if (targetCompany) {
    companies = companies.filter((c) =>
      c.name.toLowerCase().includes(targetCompany.toLowerCase())
    );
    if (!companies.length) {
      logger.error(`No company matching "${targetCompany}"`);
      return;
    }
    logger.info(`Filtered: ${companies.length} company(ies) matching "${targetCompany}"`);
  }

  logger.info(`Companies to scrape : ${companies.length}`);
  logger.info(`Already tracked     : ${store.total_seen} jobs`);
  logger.info(`Dry run             : ${dryRun}`);
  logger.info("─".repeat(64));

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    logger.info(`[${String(i + 1).padStart(3)}/${companies.length}]`);

    try {
      const jobs = await scrapeCompany(company);

      for (const job of jobs) {
        const jid = makeJobId(job.company.name || job.company, job.title, job.url);

        if (!isSeen(jid, store)) {
          newJobs.push({ ...job, company: job.company.name || job.company });
          markSeen(jid, { ...job, company: job.company.name || job.company }, store);
          logger.info(`  🆕  NEW: ${job.title}`);
        } else {
          dupsSkipped++;
          logger.debug(`  dup: ${job.title}`);
        }
      }
    } catch (err) {
      logger.error(`  💥  ${company.name}: ${err.message}`);
      errors++;
    }

    // Persist after every company — crash-safe
    saveSeen(store, SEEN_JOBS_FILE);

    // Polite delay
    if (i < companies.length - 1) {
      const delay = randInt(DELAY_MIN, DELAY_MAX);
      logger.debug(`  sleeping ${(delay / 1000).toFixed(1)}s …`);
      await sleep(delay);
    }
  }

  const elapsed = ((Date.now() - startMs) / 60000).toFixed(1);
  logger.info("─".repeat(64));
  logger.info(`Done in ${elapsed} min  |  New: ${newJobs.length}  |  Dups skipped: ${dupsSkipped}  |  Errors: ${errors}`);
  logger.info("═".repeat(64));

  await sendAlert(newJobs, dryRun);

  if (newJobs.length) {
    console.log(`\n🎉  ${newJobs.length} new job(s) found!\n`);
    newJobs.forEach((j) => {
      console.log(`  [${j.company}]  ${j.title}`);
      console.log(`  ${j.url}\n`);
    });
  } else {
    console.log(`\n😴  No new matching jobs this run (${companies.length} companies checked).\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CLI
// ═══════════════════════════════════════════════════════════════════
(async () => {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const opt  = (f) => {
    const i = args.indexOf(f);
    return i !== -1 ? args[i + 1] : null;
  };

  if (flag("--list")) {
    const companies = loadCompanies();
    companies.forEach((c) => console.log(`  ${c.name.padEnd(45)}  ${c.careers_url}`));
    console.log(`\nTotal: ${companies.length}`);
    return;
  }

  if (flag("--reset")) {
    resetSeen(SEEN_JOBS_FILE);
    logger.info("✅  seen_jobs.json cleared — all jobs will be treated as new");
    if (!flag("--run")) return;   // allow --reset --run in one command
  }

  if (flag("--test-email")) {
    const dummy = [{
      company:    "Test Company (Scaler Academy)",
      category:   "Indian Product Startup",
      title:      "Software Engineering Intern — Summer 2026",
      url:        "https://example.com/apply",
      found_date: new Date().toISOString().slice(0, 10),
    }];
    await sendAlert(dummy, false);
    return;
  }

  await run({
    dryRun:        flag("--dry-run"),
    targetCompany: opt("--company"),
  });

  process.exit(0);
})();
