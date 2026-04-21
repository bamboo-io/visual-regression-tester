const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';
const FIGMA_FILE_KEY = '554StoW7TcFht2zUoHVwL0';
const LIVE_URL = 'https://www.getbamboo.io';

// Routes to skip (dynamic content — meaningless diffs)
const SKIP_ROUTES = ['/blog'];

// Hardcoded frame map: discovered from Figma API
// Each entry: { id, name, viewport, route, width, height }
const FRAMES = [
  // Homepage
  { id: '6203:56091', name: 'homepage', viewport: 'desktop', route: '/', width: 1440, height: 7864 },
  { id: '6207:89967', name: 'homepage', viewport: 'mobile', route: '/', width: 375, height: 8789 },
  // Features
  { id: '1237:23491', name: 'features', viewport: 'desktop', route: '/features', width: 1440, height: 9256 },
  { id: '1242:13910', name: 'features', viewport: 'mobile', route: '/features', width: 375, height: 10074 },
  // Features sub-pages
  { id: '1243:14644', name: 'features-roundups', viewport: 'desktop', route: '/features/round-ups', width: 1440, height: 6748 },
  { id: '1243:14658', name: 'features-roundups', viewport: 'mobile', route: '/features/round-ups', width: 375, height: 7571 },
  { id: '1243:20886', name: 'features-topups', viewport: 'desktop', route: '/features/top-ups', width: 1440, height: 6755 },
  { id: '1243:20896', name: 'features-topups', viewport: 'mobile', route: '/features/top-ups', width: 375, height: 7564 },
  { id: '1243:23611', name: 'features-portfolio', viewport: 'desktop', route: '/features/portfolio', width: 1440, height: 6851 },
  { id: '1243:23622', name: 'features-portfolio', viewport: 'mobile', route: '/features/portfolio', width: 375, height: 7826 },
  { id: '1243:25021', name: 'features-dca', viewport: 'desktop', route: '/features/dollar-cost-average', width: 1440, height: 6877 },
  { id: '1243:25032', name: 'features-dca', viewport: 'mobile', route: '/features/dollar-cost-average', width: 375, height: 7601 },
  { id: '1243:26431', name: 'features-bamrewards', viewport: 'desktop', route: '/features/bam-rewards', width: 1440, height: 6753 },
  { id: '1243:26442', name: 'features-bamrewards', viewport: 'mobile', route: '/features/bam-rewards', width: 375, height: 7362 },
  { id: '1243:27841', name: 'features-rebalance', viewport: 'desktop', route: '/features/rebalance', width: 1440, height: 6753 },
  { id: '1243:27852', name: 'features-rebalance', viewport: 'mobile', route: '/features/rebalance', width: 375, height: 7360 },
  // SMSF
  { id: '1243:29251', name: 'smsf', viewport: 'desktop', route: '/smsf', width: 1440, height: 8082 },
  { id: '1243:29262', name: 'smsf', viewport: 'mobile', route: '/smsf', width: 375, height: 9798 },
  // Fees
  { id: '1373:70451', name: 'fees', viewport: 'desktop', route: '/fees', width: 1440, height: 3057 },
  { id: '1373:70454', name: 'fees', viewport: 'mobile', route: '/fees', width: 375, height: 3705 },
  // Security
  { id: '1244:120174', name: 'security', viewport: 'desktop', route: '/security', width: 1440, height: 5280 },
  { id: '1244:120187', name: 'security', viewport: 'mobile', route: '/security', width: 375, height: 6806 },
  // Waitlist
  { id: '1247:35948', name: 'waitlist', viewport: 'desktop', route: '/waitlist', width: 1440, height: 6082 },
  { id: '1247:35955', name: 'waitlist', viewport: 'mobile', route: '/waitlist', width: 375, height: 7210 },
  // FAQ
  { id: '1244:124158', name: 'faq', viewport: 'desktop', route: '/faq', width: 1440, height: 2434 },
  { id: '1244:124168', name: 'faq', viewport: 'mobile', route: '/faq', width: 375, height: 2736 },
  // Support
  { id: '1244:125621', name: 'support', viewport: 'desktop', route: '/support', width: 1440, height: 2227 },
  { id: '1244:125628', name: 'support', viewport: 'mobile', route: '/support', width: 375, height: 2626 },
  // About
  { id: '1244:129336', name: 'about', viewport: 'desktop', route: '/about', width: 1440, height: 4608 },
  { id: '1244:129343', name: 'about', viewport: 'mobile', route: '/about', width: 375, height: 4566 },
  // Team
  { id: '1244:130264', name: 'team', viewport: 'desktop', route: '/team', width: 1440, height: 2779 },
  { id: '1244:130271', name: 'team', viewport: 'mobile', route: '/team', width: 375, height: 3859 },
  // Podcast
  { id: '1244:128408', name: 'podcast', viewport: 'desktop', route: '/crypto-curious-podcast', width: 1440, height: 5334 },
  { id: '1244:128415', name: 'podcast', viewport: 'mobile', route: '/crypto-curious-podcast', width: 375, height: 9851 },
  // Blog
  { id: '1250:57411', name: 'blog', viewport: 'desktop', route: '/blog', width: 1440, height: 3892 },
  { id: '1250:57418', name: 'blog', viewport: 'mobile', route: '/blog', width: 375, height: 4087 },
  // Partners
  { id: '1250:66823', name: 'partners', viewport: 'desktop', route: '/partners', width: 1440, height: 7248 },
  { id: '1250:66830', name: 'partners', viewport: 'mobile', route: '/partners', width: 375, height: 7800 },
];

const OUT_DIR = path.join(__dirname, 'output');
const SHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const DIFFS_DIR = path.join(OUT_DIR, 'diffs');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.mkdirSync(DIFFS_DIR, { recursive: true });

// ── Helpers ──

/**
 * Resize both images to a common width (Figma frame width) using sharp with
 * lanczos3 kernel for high-quality bicubic resampling. If heights differ after
 * resize, pad the shorter image with white to match.
 */
async function resizeToCommon(figmaPath, livePath, targetWidth) {
  // Resize Figma image to target width, maintain aspect ratio
  let figmaBuf = await sharp(figmaPath)
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  let figmaMeta = await sharp(figmaBuf).metadata();

  // Resize live image to target width, maintain aspect ratio
  let liveBuf = await sharp(livePath)
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  let liveMeta = await sharp(liveBuf).metadata();

  const commonH = Math.max(figmaMeta.height, liveMeta.height);

  // Pad shorter image with white at the bottom
  if (figmaMeta.height < commonH) {
    figmaBuf = await sharp(figmaBuf)
      .extend({ bottom: commonH - figmaMeta.height, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
  }
  if (liveMeta.height < commonH) {
    liveBuf = await sharp(liveBuf)
      .extend({ bottom: commonH - liveMeta.height, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
  }

  // Write resized versions back
  fs.writeFileSync(figmaPath, figmaBuf);
  fs.writeFileSync(livePath, liveBuf);

  return { width: targetWidth, height: commonH };
}

function figmaGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, 'https://api.figma.com');
    const opts = { headers: { 'X-Figma-Token': FIGMA_TOKEN } };
    https.get(url.href, opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Figma JSON parse error: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      const mod = u.startsWith('https') ? https : require('http');
      mod.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error('Download failed: ' + res.statusCode));
        }
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on('finish', () => ws.close(resolve));
        ws.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    // 1. Top announcement/promo banner (#dca-report-banner)
    const dcaBanner = document.getElementById('dca-report-banner');
    if (dcaBanner) dcaBanner.style.display = 'none';

    // 2. Cookie consent popup (.CookieConsent)
    document.querySelectorAll('.CookieConsent, [class*="CookieConsent"], [class*="cookie-consent"]').forEach(el => {
      el.style.display = 'none';
    });

    // 3. Geo-location waitlist banner (WaitingListBanner)
    document.querySelectorAll('[class*="WaitingListBanner"], [class*="waitlist-banner"]').forEach(el => {
      el.style.display = 'none';
    });

    // 4. BDOW popup button (if any)
    document.querySelectorAll('button').forEach(el => {
      if (el.textContent?.trim() === 'BDOW!') el.style.display = 'none';
    });

    // 5. Adjust sticky header position — the banner pushes it down ~52px
    document.querySelectorAll('[class*="Header-module--header"]').forEach(el => {
      el.style.top = '0px';
    });
  });
}

async function capture(page, url, filePath) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await dismissOverlays(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: filePath, fullPage: true });
    return true;
  } catch (e) {
    console.log('  CAPTURE FAILED: ' + url + ' — ' + e.message.split('\n')[0]);
    return false;
  }
}

async function diffImages(figmaPath, livePath, diffPath, targetWidth) {
  // Resize both images to common dimensions using sharp (lanczos3)
  const { width: w, height: h } = await resizeToCommon(figmaPath, livePath, targetWidth);

  // Read back the resized PNGs for pixelmatch
  const img1 = PNG.sync.read(fs.readFileSync(figmaPath));
  const img2 = PNG.sync.read(fs.readFileSync(livePath));

  const diff = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });

  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  const total = w * h;
  const similarity = parseFloat(((total - diffPixels) / total * 100).toFixed(1));
  return { diffPixels, similarity, width: w, height: h };
}

// ── Main ──

(async () => {
  console.log('🎨 Figma vs Live Site — Visual Regression Comparison');
  console.log('=====================================================\n');

  // Step 1: Export all Figma frames (batch by groups of 10 to avoid URL length limits)
  // Skip blog frames from Figma export too
  const framesToExport = FRAMES.filter(f => !SKIP_ROUTES.includes(f.route));
  console.log('📦 Exporting frames from Figma...');
  const batchSize = 10;
  const figmaImageUrls = {};

  for (let i = 0; i < framesToExport.length; i += batchSize) {
    const batch = framesToExport.slice(i, i + batchSize);
    const ids = batch.map((f) => f.id).join(',');
    const resp = await figmaGet(`/v1/images/${FIGMA_FILE_KEY}?ids=${encodeURIComponent(ids)}&format=png&scale=1`);

    if (resp.err) {
      console.error('Figma API error:', resp.err);
      process.exit(1);
    }

    for (const [nodeId, url] of Object.entries(resp.images || {})) {
      if (url) figmaImageUrls[nodeId] = url;
    }
    console.log(`  Exported batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(framesToExport.length / batchSize)} (${Object.keys(figmaImageUrls).length} images so far)`);
  }

  console.log(`\n✅ Got ${Object.keys(figmaImageUrls).length} Figma exports\n`);

  // Step 2: Download Figma exports + capture live screenshots + diff
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];

  // Group frames by viewport for efficient browser context reuse
  for (const vpName of ['desktop', 'mobile']) {
    const vpFrames = FRAMES.filter((f) => f.viewport === vpName);
    const vpWidth = vpName === 'desktop' ? 1440 : 375;
    const vpHeight = vpName === 'desktop' ? 900 : 844;

    console.log(`\n=== ${vpName.toUpperCase()} ===`);
    const context = await browser.newContext({ viewport: { width: vpWidth, height: vpHeight } });
    const page = await context.newPage();

    for (const frame of vpFrames) {
      // Skip blog (dynamic content)
      if (SKIP_ROUTES.includes(frame.route)) {
        console.log(`${frame.name} (${frame.viewport})... SKIPPED (dynamic content)`);
        results.push({
          route: frame.route, name: frame.name, viewport: frame.viewport,
          figmaNodeId: frame.id, skipped: true, reason: 'Dynamic content — excluded from comparison',
          similarity: null, diffPixels: 0, width: 0, height: 0,
        });
        continue;
      }

      const label = `${frame.name}_${frame.viewport}`;
      const figmaFile = path.join(SHOTS_DIR, `figma_${label}.png`);
      const liveFile = path.join(SHOTS_DIR, `live_${label}.png`);
      const diffFile = path.join(DIFFS_DIR, `diff_figma_${label}.png`);

      process.stdout.write(`${frame.name} (${frame.viewport})... `);

      // Download Figma export
      const figmaUrl = figmaImageUrls[frame.id];
      let figmaOk = false;
      if (figmaUrl) {
        try {
          await downloadFile(figmaUrl, figmaFile);
          figmaOk = true;
        } catch (e) {
          console.log(`Figma download failed: ${e.message}`);
        }
      } else {
        console.log('No Figma export URL');
      }

      // Capture live screenshot
      const liveOk = await capture(page, LIVE_URL + frame.route, liveFile);

      if (figmaOk && liveOk) {
        const { diffPixels, similarity, width, height } = await diffImages(figmaFile, liveFile, diffFile, frame.width);
        console.log(`${similarity}% (${diffPixels} diff pixels, ${width}x${height})`);
        results.push({
          route: frame.route, name: frame.name, viewport: frame.viewport,
          figmaNodeId: frame.id, similarity, diffPixels, width, height,
        });
      } else {
        console.log('SKIPPED');
        results.push({
          route: frame.route, name: frame.name, viewport: frame.viewport,
          figmaNodeId: frame.id, similarity: null, diffPixels: 0, width: 0, height: 0,
        });
      }
    }
    await context.close();
  }

  await browser.close();

  // Save results
  const resultsPath = path.join(OUT_DIR, 'results_figma.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ Done. Results saved to ${resultsPath}`);
  console.log(`   ${results.filter((r) => r.similarity !== null).length} comparisons completed`);
  console.log(`   ${results.filter((r) => r.skipped).length} skipped (dynamic content)`);
})();
