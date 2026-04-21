const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/results.json')));

function img64(filePath) {
  try { return 'data:image/png;base64,' + fs.readFileSync(filePath).toString('base64'); }
  catch(e) { return ''; }
}

function statusColor(sim) {
  if (sim >= 90) return '#22c55e';
  if (sim >= 70) return '#f59e0b';
  return '#ef4444';
}

const ROUTES = ['homepage','about','pricing','faq','blog'];
const SHOTS = path.join(__dirname, 'output/screenshots');
const DIFFS = path.join(__dirname, 'output/diffs');

let cards = '';
for (const name of ROUTES) {
  for (const vp of ['desktop','mobile']) {
    const r = results.find(x => x.name === name && x.viewport === vp);
    if (!r) continue;
    const label = name + '_' + vp;
    const oldImg = img64(path.join(SHOTS, 'old_' + label + '.png'));
    const newImg = img64(path.join(SHOTS, 'new_' + label + '.png'));
    const diffImg = img64(path.join(DIFFS, 'diff_' + label + '.png'));
    const color = statusColor(r.similarity);
    const emoji = r.similarity >= 90 ? '✅' : r.similarity >= 70 ? '⚠️' : '❌';
    const vpIcon = vp === 'desktop' ? '🖥' : '📱';

    cards += `
    <div class="card">
      <div class="card-header" style="border-left: 4px solid ${color}">
        <span class="page-name">${vpIcon} ${name} <span style="font-weight:400;color:#64748b;font-size:13px">(${vp})</span></span>
        <span class="score" style="color:${color}">${emoji} ${r.similarity}%</span>
        <span class="diff-px">${r.diffPixels.toLocaleString()} diff px · ${r.height}px tall</span>
      </div>
      <div class="screenshots">
        <div class="col"><div class="col-label">Old (getbamboo.io)</div><img src="${oldImg}" /></div>
        <div class="col"><div class="col-label">New (netlify)</div><img src="${newImg}" /></div>
        <div class="col"><div class="col-label">Diff</div><img src="${diffImg}" /></div>
      </div>
    </div>`;
  }
}

const overallAvg = (results.reduce((s,r) => s + r.similarity, 0) / results.length).toFixed(1);
const avgColor = overallAvg >= 90 ? '22c55e' : overallAvg >= 70 ? 'f59e0b' : 'ef4444';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Visual Regression Report — Bamboo Website</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  .header { background: #1e293b; padding: 24px 32px; border-bottom: 1px solid #334155; }
  .header h1 { margin: 0 0 4px; font-size: 20px; }
  .header p { margin: 0; color: #94a3b8; font-size: 13px; }
  .summary { display: flex; gap: 16px; padding: 20px 32px; flex-wrap: wrap; }
  .stat { background: #1e293b; border-radius: 8px; padding: 14px 20px; min-width: 140px; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .stat-value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .cards { padding: 0 32px 32px; display: flex; flex-direction: column; gap: 20px; }
  .card { background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; break-inside: avoid; page-break-inside: avoid; page-break-before: always; }
  .card-header { padding: 12px 20px; display: flex; align-items: center; gap: 12px; background: #1e293b; }
  .page-name { font-weight: 700; font-size: 15px; text-transform: capitalize; }
  .score { font-weight: 700; font-size: 15px; margin-left: auto; }
  .diff-px { font-size: 12px; color: #64748b; }
  .screenshots { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: #334155; }
  .col { background: #0f172a; padding: 10px; }
  .col-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .col img { width: 100%; height: auto; border-radius: 4px; display: block; }
</style>
</head>
<body>
<div class="header">
  <h1>🔍 Visual Regression Report — Bamboo Website Migration</h1>
  <p>Old: <strong>getbamboo.io</strong> &nbsp;→&nbsp; New: <strong>bamboo-web-nextjs.netlify.app</strong> &nbsp;|&nbsp; Full page · ${new Date().toLocaleString()}</p>
</div>
<div class="summary">
  <div class="stat"><div class="stat-label">Overall Avg</div><div class="stat-value" style="color:#${avgColor}">${overallAvg}%</div></div>
  <div class="stat"><div class="stat-label">Pages</div><div class="stat-value">5</div></div>
  <div class="stat"><div class="stat-label">Viewports</div><div class="stat-value">2</div></div>
  <div class="stat"><div class="stat-label">Needs Attention</div><div class="stat-value" style="color:#ef4444">${results.filter(r=>r.similarity<90).length}</div></div>
</div>
<div class="cards">${cards}</div>
</body>
</html>`;

const outPath = path.join(__dirname, 'output/report.html');
fs.writeFileSync(outPath, html);
console.log('Done. ' + Math.round(fs.statSync(outPath).size/1024/1024*10)/10 + 'MB');
