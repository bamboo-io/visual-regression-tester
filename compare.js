const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const fs = require('fs');
const path = require('path');

const OLD_URL = 'https://www.getbamboo.io';
const NEW_URL = 'https://bamboo-web-nextjs.netlify.app';

const ROUTES = [
  { path: '/', name: 'homepage' },
  { path: '/about', name: 'about' },
  { path: '/pricing', name: 'pricing' },
  { path: '/faq', name: 'faq' },
  { path: '/blog', name: 'blog' },
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

const results = [];

async function capture(page, url, filePath) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log('  captured: ' + url);
    return true;
  } catch (e) {
    console.log('  FAILED: ' + url + ' - ' + e.message);
    return false;
  }
}

function diffImages(oldPath, newPath, diffPath) {
  try {
    const img1 = PNG.sync.read(fs.readFileSync(oldPath));
    const img2 = PNG.sync.read(fs.readFileSync(newPath));
    const w = img1.width, h = img1.height;
    const diff = new PNG({ width: w, height: h });
    const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    const sim = (((w*h - numDiff) / (w*h)) * 100).toFixed(1);
    return { similarity: parseFloat(sim), diffPixels: numDiff };
  } catch (e) {
    return { similarity: 0, error: e.message };
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const vp of VIEWPORTS) {
    console.log('\n=== ' + vp.name + ' (' + vp.width + 'x' + vp.height + ') ===');
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const label = route.name + '_' + vp.name;
      const oldFile = path.join(SHOTS_DIR, 'old_' + label + '.png');
      const newFile = path.join(SHOTS_DIR, 'new_' + label + '.png');
      const diffFile = path.join(DIFFS_DIR, 'diff_' + label + '.png');

      console.log('\n' + route.name + ' (' + vp.name + ')');
      const oldOk = await capture(page, OLD_URL + route.path, oldFile);
      const newOk = await capture(page, NEW_URL + route.path, newFile);

      let diffResult = { similarity: 'N/A' };
      if (oldOk && newOk) {
        diffResult = diffImages(oldFile, newFile, diffFile);
        console.log('  similarity: ' + diffResult.similarity + '%');
      }
      results.push({ route: route.path, name: route.name, viewport: vp.name, ...diffResult });
    }
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n\n=== SUMMARY ===');
  results.forEach(r => {
    const s = r.similarity >= 90 ? 'OK' : r.similarity >= 70 ? 'WARN' : 'FAIL';
    console.log(s + ' ' + r.name + ' (' + r.viewport + '): ' + r.similarity + '%');
  });
})();
