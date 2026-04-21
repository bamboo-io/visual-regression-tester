const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default;
const fs = require('fs');
const path = require('path');

const ROUTES = ['homepage','about','pricing','faq','blog'];
const VIEWPORTS = ['desktop','mobile'];
const SHOTS = path.join(__dirname, 'output/screenshots');
const DIFFS = path.join(__dirname, 'output/diffs');
fs.mkdirSync(DIFFS, { recursive: true });

const results = [];

function resizePNG(png, targetW, targetH) {
  const out = new PNG({ width: targetW, height: targetH });
  // Fill with white
  out.data.fill(255);
  // Copy pixels, clipping to min dimensions
  const copyW = Math.min(png.width, targetW);
  const copyH = Math.min(png.height, targetH);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      const si = (y * png.width + x) * 4;
      const di = (y * targetW + x) * 4;
      out.data[di] = png.data[si];
      out.data[di+1] = png.data[si+1];
      out.data[di+2] = png.data[si+2];
      out.data[di+3] = png.data[si+3];
    }
  }
  return out;
}

for (const vp of VIEWPORTS) {
  for (const name of ROUTES) {
    const label = name + '_' + vp;
    const oldFile = path.join(SHOTS, 'old_' + label + '.png');
    const newFile = path.join(SHOTS, 'new_' + label + '.png');
    const diffFile = path.join(DIFFS, 'diff_' + label + '.png');

    let img1 = PNG.sync.read(fs.readFileSync(oldFile));
    let img2 = PNG.sync.read(fs.readFileSync(newFile));

    // Normalize to same dimensions (use max height, same width)
    const w = img1.width; // should be same
    const h = Math.max(img1.height, img2.height);
    if (img1.height !== h) img1 = resizePNG(img1, w, h);
    if (img2.height !== h) img2 = resizePNG(img2, w, h);

    const diff = new PNG({ width: w, height: h });
    const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
    fs.writeFileSync(diffFile, PNG.sync.write(diff));

    // Also save normalized screenshots
    fs.writeFileSync(path.join(SHOTS, 'old_' + label + '.png'), PNG.sync.write(img1));
    fs.writeFileSync(path.join(SHOTS, 'new_' + label + '.png'), PNG.sync.write(img2));

    const sim = (((w*h - numDiff) / (w*h)) * 100).toFixed(1);
    console.log(name + ' (' + vp + '): ' + sim + '% (' + img1.height + 'px tall)');
    results.push({ name, viewport: vp, similarity: parseFloat(sim), diffPixels: numDiff, width: w, height: h });
  }
}

fs.writeFileSync(path.join(__dirname, 'output/results.json'), JSON.stringify(results, null, 2));
console.log('\nDone.');
