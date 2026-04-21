const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const OLD_URL = 'https://www.getbamboo.io';
const NEW_URL = 'https://bamboo-web-nextjs.netlify.app';

const OUT_DIR = path.join(__dirname, 'output');
const SHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const DIFFS_DIR = path.join(OUT_DIR, 'diffs');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const BANDS = [
  { name: 'nav', start: 0, end: 0.10 },
  { name: 'hero', start: 0.10, end: 0.30 },
  { name: 'content', start: 0.30, end: 0.70 },
  { name: 'pre-footer', start: 0.70, end: 0.90 },
  { name: 'footer', start: 0.90, end: 1.00 },
];

// ── Region diff analysis (local, no network) ──────────────────────────

function analyseRegionDiff(pageName, viewport) {
  const diffFile = path.join(DIFFS_DIR, `diff_${pageName}_${viewport}.png`);
  if (!fs.existsSync(diffFile)) return [];

  const png = PNG.sync.read(fs.readFileSync(diffFile));
  const { width, height, data } = png;
  const issues = [];

  for (const band of BANDS) {
    const yStart = Math.floor(height * band.start);
    const yEnd = Math.floor(height * band.end);
    const bandHeight = yEnd - yStart;
    if (bandHeight <= 0) continue;

    let diffCount = 0;
    const totalPixels = bandHeight * width;

    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r > 200 && g < 50 && b < 50) diffCount++;
      }
    }

    const density = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;
    if (density > 15) {
      const severity = density > 30 ? 'high' : 'medium';
      issues.push({
        type: 'region_diff',
        region: band.name,
        severity,
        description: `${band.name} band has ${density.toFixed(1)}% diff pixel density — ${severity === 'high' ? 'significant layout change' : 'noticeable differences'}`,
        fix_tag: '👷 Dev required',
        fix_hint: `Review ${band.name} section layout in ${pageName} page`,
      });
    }
  }

  return issues;
}

// ── DOM extraction helper ─────────────────────────────────────────────

async function extractDOM(page) {
  return page.evaluate(() => {
    const txt = (el) => (el.textContent || '').trim();
    const headings = [...document.querySelectorAll('h1, h2, h3')].map(el => ({
      tag: el.tagName.toLowerCase(),
      text: txt(el),
    })).filter(h => h.text.length > 0);

    const navLinks = [...document.querySelectorAll('nav a, header a')].map(el => txt(el)).filter(Boolean);
    const ctas = [...document.querySelectorAll('button, a.btn, [class*="button"], [class*="cta"], [role="button"]')]
      .map(el => txt(el)).filter(t => t.length > 0 && t.length < 100);
    const imgAlts = [...document.querySelectorAll('img')].map(el => el.getAttribute('alt') || '').filter(Boolean);
    const sectionCount = document.querySelectorAll('section').length;
    const articleCount = document.querySelectorAll('article').length;
    const mainCount = document.querySelectorAll('main').length;
    const title = document.title;

    return { headings, navLinks, ctas, imgAlts, sectionCount, articleCount, mainCount, title };
  });
}

function diffDOM(oldDOM, newDOM, pageName) {
  const issues = [];

  const oldHeadings = new Set(oldDOM.headings.map(h => `${h.tag}:${h.text}`));
  const newHeadings = new Set(newDOM.headings.map(h => `${h.tag}:${h.text}`));

  for (const h of oldHeadings) {
    if (!newHeadings.has(h)) {
      const tag = h.split(':')[0];
      const text = h.substring(h.indexOf(':') + 1);
      issues.push({
        type: 'dom_diff',
        region: 'content',
        severity: 'high',
        description: `${tag.toUpperCase()} '${text.substring(0, 80)}' missing on new site`,
        fix_tag: '👷 Dev required',
        fix_hint: `Add missing ${tag.toUpperCase()} heading to ${pageName} page content`,
      });
    }
  }
  for (const h of newHeadings) {
    if (!oldHeadings.has(h)) {
      const tag = h.split(':')[0];
      const text = h.substring(h.indexOf(':') + 1);
      issues.push({
        type: 'dom_diff',
        region: 'content',
        severity: 'low',
        description: `${tag.toUpperCase()} '${text.substring(0, 80)}' is new on new site (not in old)`,
        fix_tag: '🎨 Design decision',
        fix_hint: `Verify new ${tag.toUpperCase()} heading is intentional on ${pageName}`,
      });
    }
  }

  const oldNavSet = new Set(oldDOM.navLinks.map(l => l.toLowerCase()));
  const newNavSet = new Set(newDOM.navLinks.map(l => l.toLowerCase()));
  for (const link of oldNavSet) {
    if (!newNavSet.has(link)) {
      issues.push({
        type: 'dom_diff',
        region: 'nav',
        severity: 'medium',
        description: `Nav link '${link.substring(0, 60)}' missing on new site`,
        fix_tag: '👷 Dev required',
        fix_hint: `Add missing nav link '${link}' to site navigation`,
      });
    }
  }

  const oldCTAs = new Set(oldDOM.ctas.map(c => c.toLowerCase()));
  const newCTAs = new Set(newDOM.ctas.map(c => c.toLowerCase()));
  for (const cta of oldCTAs) {
    if (!newCTAs.has(cta)) {
      issues.push({
        type: 'dom_diff',
        region: 'content',
        severity: 'high',
        description: `CTA button '${cta.substring(0, 60)}' missing on new site`,
        fix_tag: '👷 Dev required',
        fix_hint: `Add missing CTA '${cta}' to ${pageName} page`,
      });
    }
  }

  const oldAlts = new Set(oldDOM.imgAlts);
  const newAlts = new Set(newDOM.imgAlts);
  for (const alt of oldAlts) {
    if (!newAlts.has(alt)) {
      issues.push({
        type: 'dom_diff',
        region: 'content',
        severity: 'medium',
        description: `Image '${alt.substring(0, 60)}' missing on new site`,
        fix_tag: '👷 Dev required',
        fix_hint: `Add missing image with alt '${alt}' to ${pageName}`,
      });
    }
  }

  if (oldDOM.sectionCount !== newDOM.sectionCount) {
    issues.push({
      type: 'dom_diff',
      region: 'content',
      severity: 'medium',
      description: `Section count changed: ${oldDOM.sectionCount} → ${newDOM.sectionCount}`,
      fix_tag: '👷 Dev required',
      fix_hint: `Review section structure on ${pageName} page — count mismatch`,
    });
  }

  return issues;
}

// ── CSS extraction helper ─────────────────────────────────────────────

async function extractCSS(page) {
  return page.evaluate(() => {
    const getStyles = (selector, props) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const result = {};
      for (const p of props) result[p] = cs.getPropertyValue(p);
      return result;
    };

    return {
      h1: getStyles('h1', ['font-size', 'color', 'font-family', 'font-weight']),
      h2: getStyles('h2', ['font-size', 'color']),
      nav: getStyles('header nav', ['background-color', 'display']) || getStyles('nav', ['background-color', 'display']),
      button: getStyles('button', ['background-color', 'color', 'font-size', 'border-radius'])
        || getStyles('.btn', ['background-color', 'color', 'font-size', 'border-radius'])
        || getStyles('[class*="button"]', ['background-color', 'color', 'font-size', 'border-radius']),
      body: getStyles('body', ['font-family', 'background-color', 'color']),
    };
  });
}

function diffCSS(oldCSS, newCSS, pageName) {
  const issues = [];
  const colorProps = ['color', 'background-color'];
  const fontFamilyProps = ['font-family'];

  for (const [selector, oldStyles] of Object.entries(oldCSS)) {
    if (!oldStyles || !newCSS[selector]) continue;
    const newStyles = newCSS[selector];

    for (const [prop, oldVal] of Object.entries(oldStyles)) {
      const newVal = newStyles[prop];
      if (!oldVal || !newVal || oldVal === newVal) continue;

      let fix_tag = '🤖 AI-fixable';
      let severity = 'low';
      let region = selector === 'nav' ? 'nav' : selector === 'body' ? 'content' : 'hero';

      if (colorProps.includes(prop)) {
        fix_tag = '🎨 Design decision';
      } else if (fontFamilyProps.includes(prop)) {
        fix_tag = '🎨 Design decision';
      }

      issues.push({
        type: 'css_diff',
        region,
        severity,
        description: `${selector} ${prop} changed: ${oldVal} → ${newVal}`,
        fix_tag,
        fix_hint: `Update ${selector} ${prop} in CSS/Tailwind config for ${pageName}`,
      });
    }
  }

  return issues;
}

// ── Main ──────────────────────────────────────────────────────────────

(async () => {
  const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'results_full.json'), 'utf-8'));

  const toAnalyse = results.filter(r => r.similarity !== null && r.similarity < 90);
  console.log(`Found ${toAnalyse.length} page/viewport combinations to analyse\n`);

  if (toAnalyse.length === 0) {
    fs.writeFileSync(path.join(OUT_DIR, 'bugs.json'), JSON.stringify([], null, 2));
    console.log('No pages under 90% — nothing to analyse.');
    return;
  }

  const allBugs = [];

  // Phase 1: Region diff analysis (no network needed)
  console.log('═══ Phase 1: Region diff analysis ═══');
  for (const entry of toAnalyse) {
    const issues = analyseRegionDiff(entry.name, entry.viewport);
    if (issues.length > 0) {
      console.log(`  ${entry.name} (${entry.viewport}): ${issues.length} region issues`);
    }
    entry._regionIssues = issues;
  }

  // Phase 2 & 3: DOM + CSS diff (needs Playwright)
  console.log('\n═══ Phase 2 & 3: DOM + CSS analysis ═══');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const vpName of ['desktop', 'mobile']) {
    const vpEntries = toAnalyse.filter(e => e.viewport === vpName);
    if (vpEntries.length === 0) continue;

    const vp = VIEWPORTS[vpName];
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    for (const entry of vpEntries) {
      const label = `${entry.name} (${vpName})`;
      process.stdout.write(`  ${label}... `);

      let domIssues = [];
      let cssIssues = [];

      try {
        await page.goto(OLD_URL + entry.route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);
        const oldDOM = await extractDOM(page);
        const oldCSS = await extractCSS(page);

        await page.goto(NEW_URL + entry.route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);
        const newDOM = await extractDOM(page);
        const newCSS = await extractCSS(page);

        domIssues = diffDOM(oldDOM, newDOM, entry.name);
        cssIssues = diffCSS(oldCSS, newCSS, entry.name);

        console.log(`DOM: ${domIssues.length}, CSS: ${cssIssues.length}`);
      } catch (err) {
        console.log(`ERROR: ${err.message.split('\n')[0]}`);
      }

      entry._domIssues = domIssues;
      entry._cssIssues = cssIssues;
    }

    await context.close();
  }

  await browser.close();

  for (const entry of toAnalyse) {
    const allIssues = [
      ...(entry._regionIssues || []),
      ...(entry._domIssues || []),
      ...(entry._cssIssues || []),
    ];

    allBugs.push({
      page: entry.name,
      viewport: entry.viewport,
      similarity: entry.similarity,
      issues: allIssues,
    });
  }

  const outFile = path.join(OUT_DIR, 'bugs.json');
  fs.writeFileSync(outFile, JSON.stringify(allBugs, null, 2));
  const totalIssues = allBugs.reduce((sum, b) => sum + b.issues.length, 0);
  console.log(`\n✅ Done. ${totalIssues} issues across ${allBugs.length} pages → ${outFile}`);
})();
