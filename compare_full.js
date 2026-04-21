const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default;
const fs = require('fs');
const path = require('path');

const OLD_URL = 'https://www.getbamboo.io';
const NEW_URL = 'https://bamboo-web-nextjs.netlify.app';

const ROUTES = [
  { path: '/', name: 'homepage' },
  { path: '/about', name: 'about' },
  { path: '/features', name: 'features' },
  { path: '/features/portfolio', name: 'features-portfolio' },
  { path: '/features/rebalance', name: 'features-rebalance' },
  { path: '/features/round-ups', name: 'features-round-ups' },
  { path: '/features/top-ups', name: 'features-top-ups' },
  { path: '/features/bam-rewards', name: 'features-bam-rewards' },
  { path: '/features/dollar-cost-average', name: 'features-dca' },
  { path: '/fees', name: 'fees' },
  { path: '/faq', name: 'faq' },
  { path: '/security', name: 'security' },
  { path: '/team', name: 'team' },
  { path: '/blog', name: 'blog' },
  { path: '/crypto-curious-podcast', name: 'podcast' },
  { path: '/partners', name: 'partners' },
  { path: '/smsf', name: 'smsf' },
  { path: '/support', name: 'support' },
  { path: '/invest', name: 'invest' },
  { path: '/gold-silver', name: 'gold-silver' },
  { path: '/bitcoin-ethereum', name: 'bitcoin-ethereum' },
  { path: '/waitlist', name: 'waitlist' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const OUT_DIR = path.join(__dirname, 'output');
const SHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const DIFFS_DIR = path.join(OUT_DIR, 'diffs');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.mkdirSync(DIFFS_DIR, { recursive: true });

function resizePNG(png, targetW, targetH) {
  const out = new PNG({ width: targetW, height: targetH });
  out.data.fill(255);
  const copyW = Math.min(png.width, targetW);
  const copyH = Math.min(png.height, targetH);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      const si = (y * png.width + x) * 4;
      const di = (y * targetW + x) * 4;
      out.data[di] = png.data[si]; out.data[di+1] = png.data[si+1];
      out.data[di+2] = png.data[si+2]; out.data[di+3] = png.data[si+3];
    }
  }
  return out;
}

async function capture(page, url, filePath) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: filePath, fullPage: true });
    return true;
  } catch (e) {
    console.log('  FAILED: ' + url + ' - ' + e.message.split('\n')[0]);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log('\n=== ' + vp.name + ' ===');
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const label = route.name + '_' + vp.name;
      const oldFile = path.join(SHOTS_DIR, 'old_' + label + '.png');
      const newFile = path.join(SHOTS_DIR, 'new_' + label + '.png');
      const diffFile = path.join(DIFFS_DIR, 'diff_' + label + '.png');

      process.stdout.write(route.name + ' (' + vp.name + ')... ');
      const oldOk = await capture(page, OLD_URL + route.path, oldFile);
      const newOk = await capture(page, NEW_URL + route.path, newFile);

      let sim = 'N/A', diffPixels = 0, w = 0, h = 0;
      if (oldOk && newOk) {
        let img1 = PNG.sync.read(fs.readFileSync(oldFile));
        let img2 = PNG.sync.read(fs.readFileSync(newFile));
        w = img1.width;
        h = Math.max(img1.height, img2.height);
        if (img1.height !== h) img1 = resizePNG(img1, w, h);
        if (img2.height !== h) img2 = resizePNG(img2, w, h);
        const diff = new PNG({ width: w, height: h });
        diffPixels = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
        fs.writeFileSync(diffFile, PNG.sync.write(diff));
        fs.writeFileSync(oldFile, PNG.sync.write(img1));
        fs.writeFileSync(newFile, PNG.sync.write(img2));
        sim = parseFloat((((w*h - diffPixels) / (w*h)) * 100).toFixed(1));
        console.log(sim + '%');
      } else {
        console.log('SKIPPED');
      }
      results.push({ route: route.path, name: route.name, viewport: vp.name, similarity: sim, diffPixels, width: w, height: h });
    }
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'results_full.json'), JSON.stringify(results, null, 2));
  console.log('\n\nDone. Results saved to output/results_full.json');
})();
