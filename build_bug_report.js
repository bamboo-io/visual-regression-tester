const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const OUT_DIR = path.join(__dirname, 'output');

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function severityColor(s) {
  if (s === 'high') return '#ef4444';
  if (s === 'medium') return '#f59e0b';
  return '#64748b';
}

function severityBadge(s) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${severityColor(s)}">${s.toUpperCase()}</span>`;
}

function simColor(sim) {
  if (sim >= 90) return '#22c55e';
  if (sim >= 80) return '#f59e0b';
  return '#ef4444';
}

function simBadge(sim) {
  const c = simColor(sim);
  const emoji = sim >= 90 ? '✅' : sim >= 80 ? '⚠️' : '❌';
  return `<span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:700;color:${c};background:${c}22;border:1px solid ${c}44">${emoji} ${sim}%</span>`;
}

function fixTagBadge(tag) {
  let bg = '#334155';
  if (tag.includes('AI-fixable')) bg = '#059669';
  else if (tag.includes('Dev required')) bg = '#dc2626';
  else if (tag.includes('Design decision')) bg = '#7c3aed';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${bg}">${escapeHtml(tag)}</span>`;
}

(async () => {
  const bugs = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'bugs.json'), 'utf-8'));

  // Summary stats
  const allIssues = bugs.flatMap(b => b.issues);
  const total = allIssues.length;
  const byS = { high: 0, medium: 0, low: 0 };
  const byTag = {};
  for (const iss of allIssues) {
    byS[iss.severity] = (byS[iss.severity] || 0) + 1;
    byTag[iss.fix_tag] = (byTag[iss.fix_tag] || 0) + 1;
  }

  const pagesWithIssues = bugs.filter(b => b.issues.length > 0);
  const aiFixable = allIssues.filter(i => i.fix_tag.includes('AI-fixable'));

  // Build page sections
  let pageSections = '';
  for (const entry of pagesWithIssues) {
    const vpIcon = entry.viewport === 'desktop' ? '🖥' : '📱';
    const sorted = [...entry.issues].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.severity] || 3) - (order[b.severity] || 3);
    });

    let rows = '';
    for (const iss of sorted) {
      rows += `<tr>
        <td>${escapeHtml(iss.region)}</td>
        <td>${escapeHtml(iss.type)}</td>
        <td>${severityBadge(iss.severity)}</td>
        <td>${escapeHtml(iss.description)}</td>
        <td>${fixTagBadge(iss.fix_tag)}</td>
        <td style="font-size:12px;color:#94a3b8">${escapeHtml(iss.fix_hint)}</td>
      </tr>`;
    }

    pageSections += `
    <div class="card">
      <div class="card-header">
        <span class="page-name">${vpIcon} ${escapeHtml(entry.page)} <span style="font-weight:400;color:#64748b;font-size:12px">(${entry.viewport})</span></span>
        <span style="margin-left:12px">${simBadge(entry.similarity)}</span>
        <span style="margin-left:auto;font-size:13px;color:#94a3b8">${entry.issues.length} issue${entry.issues.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Region</th><th>Type</th><th>Severity</th><th>Description</th><th>Fix Tag</th><th>Fix Hint</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // Quick wins section
  let quickWinsRows = '';
  for (const entry of pagesWithIssues) {
    const ai = entry.issues.filter(i => i.fix_tag.includes('AI-fixable'));
    for (const iss of ai) {
      quickWinsRows += `<tr>
        <td>${escapeHtml(entry.page)} (${entry.viewport})</td>
        <td>${escapeHtml(iss.description)}</td>
        <td style="font-size:12px;color:#94a3b8">${escapeHtml(iss.fix_hint)}</td>
      </tr>`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Bug Report — Bamboo Website Migration</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  .header { background: #1e293b; padding: 24px 32px; border-bottom: 1px solid #334155; }
  .header h1 { margin: 0 0 4px; font-size: 22px; }
  .header p { margin: 0; color: #94a3b8; font-size: 13px; }
  .summary { display: flex; gap: 16px; padding: 20px 32px; flex-wrap: wrap; }
  .stat { background: #1e293b; border-radius: 8px; padding: 14px 20px; min-width: 130px; border: 1px solid #334155; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .stat-value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .cards { padding: 0 32px 32px; display: flex; flex-direction: column; gap: 20px; }
  .card { background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; break-inside: avoid; }
  .card-header { padding: 14px 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #334155; }
  .page-name { font-weight: 700; font-size: 15px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #0f172a; padding: 8px 12px; text-align: left; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
  td { padding: 8px 12px; border-top: 1px solid #0f172a33; vertical-align: top; max-width: 350px; word-wrap: break-word; }
  tr:hover td { background: #0f172a33; }
  .section-title { padding: 20px 32px 8px; font-size: 18px; font-weight: 700; }
  .quick-wins { margin: 0 32px 32px; background: #064e3b; border-radius: 10px; overflow: hidden; border: 1px solid #059669; }
  .quick-wins .qw-header { padding: 14px 20px; font-weight: 700; font-size: 15px; border-bottom: 1px solid #059669; }
  .quick-wins table { font-size: 12px; }
  .quick-wins th { background: #022c22; }
</style>
</head>
<body>
<div class="header">
  <h1>🐛 Bug Report — Bamboo Website Migration</h1>
  <p>Automated analysis of visual regression results · Old: <strong>getbamboo.io</strong> → New: <strong>bamboo-web-nextjs.netlify.app</strong> · ${new Date().toLocaleString()}</p>
</div>
<div class="summary">
  <div class="stat"><div class="stat-label">Total Issues</div><div class="stat-value">${total}</div></div>
  <div class="stat"><div class="stat-label">🔴 High</div><div class="stat-value" style="color:#ef4444">${byS.high}</div></div>
  <div class="stat"><div class="stat-label">🟡 Medium</div><div class="stat-value" style="color:#f59e0b">${byS.medium}</div></div>
  <div class="stat"><div class="stat-label">⚪ Low</div><div class="stat-value" style="color:#64748b">${byS.low}</div></div>
  <div class="stat"><div class="stat-label">👷 Dev Required</div><div class="stat-value" style="color:#dc2626">${byTag['👷 Dev required'] || 0}</div></div>
  <div class="stat"><div class="stat-label">🤖 AI-Fixable</div><div class="stat-value" style="color:#059669">${byTag['🤖 AI-fixable'] || 0}</div></div>
  <div class="stat"><div class="stat-label">🎨 Design Decision</div><div class="stat-value" style="color:#7c3aed">${byTag['🎨 Design decision'] || 0}</div></div>
  <div class="stat"><div class="stat-label">Pages Affected</div><div class="stat-value">${pagesWithIssues.length}</div></div>
</div>

<div class="section-title">📋 Issues by Page</div>
<div class="cards">
${pageSections}
</div>

${aiFixable.length > 0 ? `
<div class="section-title">⚡ Quick Wins — AI-Fixable Issues</div>
<div class="quick-wins">
  <div class="qw-header">🤖 ${aiFixable.length} issues that can be auto-fixed</div>
  <table>
    <thead><tr><th>Page</th><th>Description</th><th>Fix Hint</th></tr></thead>
    <tbody>${quickWinsRows}</tbody>
  </table>
</div>
` : ''}

</body>
</html>`;

  const htmlPath = path.join(OUT_DIR, 'bug-report.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML report: ${htmlPath} (${Math.round(fs.statSync(htmlPath).size / 1024)}KB)`);

  // Serve via HTTP and generate PDF
  const server = http.createServer((req, res) => {
    const filePath = path.join(OUT_DIR, req.url === '/' ? 'bug-report.html' : req.url.replace(/^\//, ''));
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(8766, resolve));
  console.log('HTTP server on :8766');

  try {
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:8766/bug-report.html', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    const pdfPath = path.join(OUT_DIR, 'bug-report.pdf');
    await page.pdf({ path: pdfPath, format: 'A3', landscape: true, printBackground: true });
    await browser.close();
    console.log(`PDF report: ${pdfPath} (${Math.round(fs.statSync(pdfPath).size / 1024)}KB)`);
  } catch (err) {
    console.error('PDF generation failed:', err.message);
  }

  server.close();
  console.log('\n✅ Bug report complete.');
})();
