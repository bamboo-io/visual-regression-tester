const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/results_figma.json')));
const SHOTS = path.join(__dirname, 'output/screenshots');
const DIFFS = path.join(__dirname, 'output/diffs');

function img64(filePath) {
  try { return 'data:image/png;base64,' + fs.readFileSync(filePath).toString('base64'); }
  catch (e) { return ''; }
}
function color(sim) {
  if (sim === null) return '#64748b';
  if (sim >= 90) return '#22c55e';
  if (sim >= 80) return '#f59e0b';
  return '#ef4444';
}
function emoji(sim) {
  if (sim === null) return '⏭';
  if (sim >= 90) return '✅';
  if (sim >= 80) return '⚠️';
  return '❌';
}

// Collect unique page names in order
const pageNames = [];
for (const r of results) {
  if (!pageNames.includes(r.name)) pageNames.push(r.name);
}

let cards = '';
for (const name of pageNames) {
  for (const vp of ['desktop', 'mobile']) {
    const r = results.find((x) => x.name === name && x.viewport === vp);
    if (!r) continue;
    const label = name + '_' + vp;
    const figmaImg = img64(path.join(SHOTS, 'figma_' + label + '.png'));
    const liveImg = img64(path.join(SHOTS, 'live_' + label + '.png'));
    const diffImg = img64(path.join(DIFFS, 'diff_figma_' + label + '.png'));
    const c = color(r.similarity);
    const e = emoji(r.similarity);
    const vpIcon = vp === 'desktop' ? '🖥' : '📱';
    const simText = r.similarity !== null ? r.similarity + '%' : 'N/A';
    const hasScreenshots = figmaImg && liveImg;

    cards += `
    <div class="card">
      <div class="card-header" style="border-left:4px solid ${c}">
        <span class="page-name">${vpIcon} ${name} <span style="font-weight:400;color:#64748b;font-size:12px">(${vp}) ${r.route}</span></span>
        <span class="score" style="color:${c}">${e} ${simText}</span>
      </div>
      ${hasScreenshots ? `<div class="screenshots">
        <div class="col"><div class="col-label">Figma Design</div><img src="${figmaImg}" /></div>
        <div class="col"><div class="col-label">Live Site</div><img src="${liveImg}" /></div>
        <div class="col"><div class="col-label">Diff</div><img src="${diffImg}" /></div>
      </div>` : '<div style="padding:12px 20px;color:#64748b;font-size:13px">Screenshots not available</div>'}
    </div>`;
  }
}

const valid = results.filter((r) => r.similarity !== null);
const avg = valid.length ? (valid.reduce((s, r) => s + r.similarity, 0) / valid.length).toFixed(1) : 'N/A';
const failing = valid.filter((r) => r.similarity < 80).length;
const warning = valid.filter((r) => r.similarity >= 80 && r.similarity < 90).length;
const passing = valid.filter((r) => r.similarity >= 90).length;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Figma vs Live Site — Visual Regression Report</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  .header { background: #1e293b; padding: 24px 32px; border-bottom: 1px solid #334155; }
  .header h1 { margin: 0 0 4px; font-size: 20px; }
  .header p { margin: 0; color: #94a3b8; font-size: 13px; }
  .summary { display: flex; gap: 16px; padding: 20px 32px; flex-wrap: wrap; }
  .stat { background: #1e293b; border-radius: 8px; padding: 14px 20px; min-width: 130px; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .stat-value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .score-table { margin: 0 32px 24px; background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; }
  .score-table table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .score-table th { background: #0f172a; padding: 10px 16px; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .score-table td { padding: 10px 16px; border-top: 1px solid #1e293b; }
  .score-table tr:hover td { background: #0f172a22; }
  .cards { padding: 0 32px 32px; display: flex; flex-direction: column; gap: 20px; }
  .card { background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; break-inside: avoid; }
  .card-header { padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
  .page-name { font-weight: 700; font-size: 15px; }
  .score { font-weight: 700; font-size: 15px; margin-left: auto; }
  .screenshots { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: #334155; }
  .col { background: #0f172a; padding: 10px; }
  .col-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .col img { width: 100%; height: auto; border-radius: 4px; display: block; }
</style>
</head>
<body>
<div class="header">
  <h1>🎨 Figma vs Live Site — Visual Regression Report</h1>
  <p>Figma: <strong>Bamboo - Website</strong> → Live: <strong>getbamboo.io</strong> · ${new Date().toLocaleString()} · ${pageNames.length} pages × 2 viewports</p>
</div>
<div class="summary">
  <div class="stat"><div class="stat-label">Avg Match</div><div class="stat-value" style="color:${color(parseFloat(avg))}">${avg}%</div></div>
  <div class="stat"><div class="stat-label">✅ Passing (&ge;90%)</div><div class="stat-value" style="color:#22c55e">${passing}</div></div>
  <div class="stat"><div class="stat-label">⚠️ Warning (80-90%)</div><div class="stat-value" style="color:#f59e0b">${warning}</div></div>
  <div class="stat"><div class="stat-label">❌ Failing (&lt;80%)</div><div class="stat-value" style="color:#ef4444">${failing}</div></div>
</div>
<div class="score-table">
  <table>
    <tr><th>Page</th><th>Route</th><th>Desktop</th><th>Mobile</th></tr>
    ${pageNames.map((name) => {
      const d = results.find((r) => r.name === name && r.viewport === 'desktop');
      const m = results.find((r) => r.name === name && r.viewport === 'mobile');
      const route = (d || m).route;
      const fmt = (r) => r && r.similarity !== null ? `<span style="color:${color(r.similarity)}">${emoji(r.similarity)} ${r.similarity}%</span>` : '<span style="color:#64748b">N/A</span>';
      return `<tr><td style="font-weight:600">${name}</td><td style="color:#94a3b8;font-size:12px">${route}</td><td>${fmt(d)}</td><td>${fmt(m)}</td></tr>`;
    }).join('')}
  </table>
</div>
<div class="cards">${cards}</div>
</body>
</html>`;

const outPath = path.join(__dirname, 'output/figma_report.html');
fs.writeFileSync(outPath, html);
const sizeMB = Math.round(fs.statSync(outPath).size / 1024 / 1024 * 10) / 10;
console.log(`✅ Report written to ${outPath} (${sizeMB}MB)`);
console.log(`   ${pageNames.length} pages, ${valid.length} comparisons, avg similarity: ${avg}%`);
