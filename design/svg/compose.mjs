import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = JSON.parse(await readFile(path.join(here, 'kit.json'), 'utf8'));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const partSvg = (name, colors) => (kit.parts[name] ?? []).map(shape => {
  const fill = colors[shape.fill];
  if (shape.d) return `<path d="${shape.d}" fill="${fill}"/>`;
  if (shape.circle) return `<circle cx="${shape.circle[0]}" cy="${shape.circle[1]}" r="${shape.circle[2]}" fill="${fill}"/>`;
  if (shape.ellipse) return `<ellipse cx="${shape.ellipse[0]}" cy="${shape.ellipse[1]}" rx="${shape.ellipse[2]}" ry="${shape.ellipse[3]}" fill="${fill}"/>`;
  return '';
}).join('');

export function composeChicken({ breed = 0, sex = 0, plumage = 0, tokenId = 42 } = {}) {
  const b = kit.breeds[Number(breed)];
  const p = kit.plumage[Number(plumage)];
  if (!b || !p || ![0, 1].includes(Number(sex))) throw new RangeError('breed, sex, or plumage index out of range');
  const colors = { ...p, ...kit.fixed };
  const names = [...b.parts];
  if (Number(sex) === 1) {
    for (const part of ['henComb', 'henFloppyComb', 'shortTail', 'fanTail', 'cushionTail', 'uprightTail']) {
      const index = names.indexOf(part);
      if (index !== -1) names.splice(index, 1);
    }
    names.push(...kit.sex.rooster.parts.filter(name => name !== 'longTail'));
    names.push('longTail');
  }
  const body = names.map(name => partSvg(name, colors)).join('');
  const band = `KK-${String(tokenId).padStart(4, '0')}`;
  const birdScale = Number(b.scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${kit.viewBox}"><rect width="400" height="400" rx="24" fill="#161b23"/><g transform="translate(${200 * (1 - birdScale)} ${330 * (1 - birdScale)}) scale(${birdScale})">${body}</g><text x="24" y="376" text-anchor="start" fill="#8c95a3" font-family="monospace" font-size="18">${esc(band)}</text><text x="376" y="376" text-anchor="end" fill="#8c95a3" font-family="monospace" font-size="18">${esc(b.name)}</text></svg>`;
}

export function composeEgg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="24" fill="#161b23"/><path d="M200 62 C128 62 91 161 98 238 C103 302 147 341 200 341 C253 341 297 302 302 238 C309 161 272 62 200 62Z" fill="#f2e5c9"/><path d="M158 111 C135 145 124 188 128 226" fill="none" stroke="#fff8e9" stroke-width="12" stroke-linecap="round" opacity=".8"/></svg>';
}

const chickenRows = [];
const byteTotal = kit.parts && Object.values(kit.parts).flat().reduce((n, shape) => n + Buffer.byteLength(shape.d ?? '', 'utf8'), 0);
async function buildAll() {
  const out = path.join(here, 'out');
  await mkdir(out, { recursive: true });
  let id = 1;
  for (let breed = 0; breed < kit.breeds.length; breed++) {
    for (let sex = 0; sex < 2; sex++) {
      const filename = `${String(breed).padStart(2, '0')}-${kit.breeds[breed].name.toLowerCase()}-${sex ? 'rooster' : 'hen'}.svg`;
      const svg = composeChicken({ breed, sex, plumage: breed % kit.plumage.length, tokenId: id++ });
      await writeFile(path.join(out, filename), svg);
      chickenRows.push({ filename, breed: kit.breeds[breed].name, sex: sex ? 'Rooster' : 'Hen', plumage: kit.plumage[breed % kit.plumage.length].name, svg });
    }
  }
  await generatePreview();
  console.log(`Wrote ${chickenRows.length} chickens; total d-string bytes: ${byteTotal}`);
}

async function generatePreview() {
  const svgFiles = (await readdir(path.join(here, 'egg'))).filter(name => name.endsWith('.svg')).sort();
  const eggRows = await Promise.all(svgFiles.map(async filename => ({ filename, svg: await readFile(path.join(here, 'egg', filename), 'utf8') })));
  const brandFiles = (await readdir(path.join(here, 'brand'))).filter(name => name.endsWith('.svg')).sort();
  const brandRows = await Promise.all(brandFiles.map(async filename => ({ filename, svg: await readFile(path.join(here, 'brand', filename), 'utf8') })));
  const card = (title, svg) => `<article><h2>${esc(title)}</h2>${svg}</article>`;
  const cards = [...chickenRows.map(row => card(`${row.breed} · ${row.sex} · ${row.plumage}`, row.svg)), ...eggRows.map(row => card(`Egg · ${row.filename}`, row.svg)), ...brandRows.map(row => card(`Brand · ${row.filename}`, row.svg))].join('\n');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Khai &amp; Kai · Night Coop art review</title><style>body{margin:0;padding:32px;background:#0e1116;color:#f2f4f7;font:15px system-ui,sans-serif}h1{margin:0 0 24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}article{padding:12px;background:#161b23;border:1px solid #262c36;border-radius:16px}h2{font-size:13px;color:#8c95a3;margin:0 0 10px}svg{display:block;width:100%;height:auto;border-radius:12px}article:has(svg[viewBox="0 0 64 64"]) svg{max-width:160px}article:has(svg[viewBox="0 0 24 24"]) svg{max-width:96px}</style><h1>Khai &amp; Kai · Night Coop</h1><main>${cards}</main></html>`;
  await writeFile(path.join(here, 'preview.html'), html);
}

if (process.argv.includes('--all')) await buildAll();
else if (process.argv.includes('--preview')) await generatePreview();
