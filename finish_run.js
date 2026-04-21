const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default;
const fs = require('fs');
const path = require('path');

const OLD_URL = 'https://www.getbamboo.io';
const NEW_URL = 'https://bamboo-web-nextjs.netlify.app';

// Only remaining mobile pages + fix partners_mobile
const ROUTES = [
  { path: '/partners', name: 'partners' },
  { path: '/smsf', name: 'smsf' },
  { path: '/support', name: 'support' },
  { path: '/invest', name: 'invest' },
  { path: '/gold-silver', name: 'gold-silver' },
  { path: '/bitcoin-ethereum', name: 'bitcoin-ethereum' },
  { path: '/waitlist', name: 'waitlist' },
];

const OUT_DIR = path.join(__dirname, 'output');
const SHOTS_DIR = path.join(OUT_DIR, 'screenshots');
const DIFFS_DIR = path.join(OUT_DIR, 'diffs');

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

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const newResults = [];

  for (const route of ROUTES) {
    const label = route.name + '_mobile';
    const oldFile = path.join(SHOTS_DIR, 'old_' + label + '.png');
    const newFile = path.join(SHOTS_DIR, 'new_' + label + '.png');
    const diffFile = path.join(DIFFS_DIR, 'diff_' + label + '.png');

    process.stdout.write(route.name + ' (mobile)... ');
    try {
      await page.goto(OLD_URL + route.path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: oldFile, fullPage: true });
      await page.goto(NEW_URL + route.path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: newFile, fullPage: true });

      let img1 = PNG.sync.read(fs.readFileSync(oldFile));
      let img2 = PNG.sync.read(fs.readFileSync(newFile));
      const w = Math.min(img1.width, img2.width); // use min width to handle responsive quirks
      const h = Math.max(img1.height, img2.height);
      if (img1.width !== w || img1.height !== h) img1 = resizePNG(img1, w, h);
      if (img2.width !== w || img2.height !== h) img2 = resizePNG(img2, w, h);
      const diff = new PNG({ width: w, height: h });
      const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
      fs.writeFileSync(diffFile, PNG.sync.write(diff));
      fs.writeFileSync(oldFile, PNG.sync.write(img1));
      fs.writeFileSync(newFile, PNG.sync.write(img2));
      const sim = parseFloat((((w*h - numDiff)/(w*h))*100).toFixed(1));
      console.log(sim + '%');
      newResults.push({ route: route.path, name: route.name, viewport: 'mobile', similarity: sim, diffPixels: numDiff, width: w, height: h });
    } catch(e) {
      console.log('ERROR: ' + e.message.split('\n')[0]);
      newResults.push({ route: route.path, name: route.name, viewport: 'mobile', similarity: 'N/A', diffPixels: 0, width: 0, height: 0 });
    }
  }

  await browser.close();

  // Merge with existing results
  const existing = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'results_full.json')));
  // Remove any existing mobile entries for these routes
  const routeNames = ROUTES.map(r => r.name);
  const filtered = existing.filter(r => !(routeNames.includes(r.name) && r.viewport === 'mobile'));
  const merged = [...filtered, ...newResults];
  fs.writeFileSync(path.join(OUT_DIR, 'results_full.json'), JSON.stringify(merged, null, 2));
  console.log('\nDone. Total results:', merged.length);
})();
