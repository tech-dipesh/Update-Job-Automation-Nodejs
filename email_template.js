"use strict";

/**
 * email_template.js — HTML + plain-text email builder
 *
 * Returns { subject, html, text } for use with Nodemailer.
 */

const CATEGORY_STYLES = {
  "Indian Product Startup": { bg: "#dcfce7", fg: "#15803d", label: "🇮🇳 Indian Startup" },
  "Foreign MNC":            { bg: "#dbeafe", fg: "#1d4ed8", label: "🌐 Foreign MNC"     },
  "Fintech & Banking":      { bg: "#fef9c3", fg: "#b45309", label: "💳 Fintech"         },
  "Consulting":             { bg: "#f3e8ff", fg: "#7c3aed", label: "🏢 Consulting"      },
};

function categoryBadge(cat) {
  const s = CATEGORY_STYLES[cat] || { bg: "#f1f5f9", fg: "#475569", label: cat };
  return `<span style="display:inline-block;background:${s.bg};color:${s.fg};
    padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;
    letter-spacing:.3px;white-space:nowrap">${s.label}</span>`;
}

function applyBtn(url) {
  if (!url || url === "#" || url.startsWith("javascript:")) {
    return `<span style="color:#94a3b8;font-size:12px">No direct link</span>`;
  }
  return `<a href="${url}" target="_blank" rel="noopener"
    style="display:inline-block;background:#2563eb;color:#fff;
    padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;
    text-decoration:none;white-space:nowrap">Apply →</a>`;
}

function buildRows(byCompany) {
  let rows = "";
  let rowIdx = 0;

  for (const [company, jobs] of Object.entries(byCompany).sort()) {
    for (const job of jobs) {
      const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
      rows += `
      <tr style="background:${bg}">
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;
          font-weight:700;color:#0f172a;white-space:nowrap;vertical-align:top">
          ${escHtml(company)}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:14px;color:#1e293b;font-weight:600;margin-bottom:4px">
            ${escHtml(job.title)}
          </div>
          <div style="font-size:12px;color:#64748b">${job.found_date || ""}</div>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
          ${categoryBadge(job.category || "")}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;
          text-align:center;vertical-align:top">
          ${applyBtn(job.url)}
        </td>
      </tr>`;
      rowIdx++;
    }
  }
  return rows;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the email content.
 *
 * @param {Array<{company,title,url,category,found_date}>} newJobs
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildEmail(newJobs) {
  const n       = newJobs.length;
  const runTime = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = `🚀 ${n} New Tech Job${n !== 1 ? "s" : ""} Found — ${
    new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })
  }`;

  // Group by company
  const byCompany = {};
  for (const job of newJobs) {
    (byCompany[job.company] = byCompany[job.company] || []).push(job);
  }
  const companyCount = Object.keys(byCompany).length;

  const rows    = buildRows(byCompany);
  const catCounts = {};
  for (const j of newJobs) {
    catCounts[j.category] = (catCounts[j.category] || 0) + 1;
  }
  const catSummary = Object.entries(catCounts)
    .map(([cat, cnt]) => {
      const s = CATEGORY_STYLES[cat] || { label: cat };
      return `<span style="margin-right:12px">${s.label}: <strong>${cnt}</strong></span>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Job Alert</title>
</head>
<body style="margin:0;padding:20px 10px;background:#f1f5f9;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

  <div style="max-width:760px;margin:0 auto;background:#fff;border-radius:16px;
    overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)">

    <!-- ── HEADER ── -->
    <div style="background:linear-gradient(135deg,#1e3a8a 0%,#4f46e5 60%,#7c3aed 100%);
      padding:32px 36px;color:#fff">
      <div style="font-size:40px;margin-bottom:10px">🚀</div>
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;letter-spacing:-.5px">
        ${n} New Tech Job${n !== 1 ? "s" : ""} Found!
      </h1>
      <p style="margin:0;opacity:.8;font-size:14px">
        ${runTime} IST &nbsp;·&nbsp; India Job Bot &nbsp;·&nbsp; dipesh77gautam@gmail.com
      </p>
    </div>

    <!-- ── SUMMARY BAR ── -->
    <div style="padding:14px 36px;background:#eff6ff;border-bottom:1px solid #bfdbfe">
      <p style="margin:0;color:#1e40af;font-size:14px">
        Found <strong>${n}</strong> new job${n !== 1 ? "s" : ""} across
        <strong>${companyCount}</strong> ${companyCount !== 1 ? "companies" : "company"}.
        All are <em>new</em> — not seen in previous runs.
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#3b82f6">${catSummary}</p>
    </div>

    <!-- ── TABLE ── -->
    <div style="padding:24px 36px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:560px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:700;
              border-bottom:2px solid #e2e8f0;white-space:nowrap">Company</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:700;
              border-bottom:2px solid #e2e8f0">Role</th>
            <th style="padding:10px 14px;text-align:left;color:#374151;font-weight:700;
              border-bottom:2px solid #e2e8f0">Category</th>
            <th style="padding:10px 14px;text-align:center;color:#374151;font-weight:700;
              border-bottom:2px solid #e2e8f0">Apply</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- ── TIP ── -->
    <div style="padding:16px 36px;background:#f0fdf4;border-top:1px solid #bbf7d0">
      <p style="margin:0;font-size:13px;color:#15803d">
        💡 <strong>Pro tip:</strong> Apply within 24 hours — early applications get more visibility on most ATS systems.
      </p>
    </div>

    <!-- ── FOOTER ── -->
    <div style="padding:18px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;
      text-align:center">
      <p style="margin:0;color:#9ca3af;font-size:12px">
        India Job Alert Bot &nbsp;·&nbsp; Runs every 3 hours via GitHub Actions &nbsp;·&nbsp;
        <a href="mailto:${process.env.ALERT_EMAIL || "dipesh77gautam@gmail.com"}"
          style="color:#9ca3af">Unsubscribe</a>
      </p>
    </div>
  </div>

</body>
</html>`;

  // Plain-text fallback
  const text = [
    `🚀 ${n} New Tech Job${n !== 1 ? "s" : ""} Found — ${runTime} IST`,
    "=".repeat(60),
    "",
    ...newJobs.map((j) => `[${j.company}]\n  ${j.title}\n  ${j.url || "No URL"}\n  Found: ${j.found_date}`),
    "",
    "—",
    "India Job Alert Bot | Runs every 3 hours via GitHub Actions",
  ].join("\n");

  return { subject, html, text };
}

module.exports = { buildEmail };
