// Prepara o projeto para rodar OFFLINE:
// 1. copia o MediaPipe Tasks Vision (JS + WASM) de node_modules para public/vendor
// 2. baixa o modelo Pose Landmarker Lite para public/models
// Rode uma vez com internet: `npm install && npm run setup`.
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const vendor = join(root, 'public', 'vendor', 'tasks-vision');
const models = join(root, 'public', 'models');

// Versão "1" fixada dos modelos (não usar /latest/ para manter o ensaio reproduzível).
// lite e full sempre; heavy só com `npm run setup -- --heavy` (~30 MB, bem mais lento).
const variants = ['lite', 'full', ...(process.argv.includes('--heavy') ? ['heavy'] : [])];
const modelUrl = (v) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task`;

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  if (!(await exists(src))) {
    console.error('node_modules/@mediapipe/tasks-vision não encontrado. Rode `npm install` primeiro.');
    process.exit(1);
  }
  await mkdir(vendor, { recursive: true });
  await cp(join(src, 'vision_bundle.mjs'), join(vendor, 'vision_bundle.mjs'));
  await cp(join(src, 'wasm'), join(vendor, 'wasm'), { recursive: true });
  console.log('✓ MediaPipe copiado para public/vendor/tasks-vision');

  await mkdir(models, { recursive: true });
  for (const v of variants) {
    const file = join(models, `pose_landmarker_${v}.task`);
    if (await exists(file)) {
      console.log(`✓ Modelo ${v} já presente`);
      continue;
    }
    console.log(`↓ Baixando modelo de pose ${v}...`);
    const res = await fetch(modelUrl(v));
    if (!res.ok) throw new Error(`Falha ao baixar modelo ${v}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
    console.log(`✓ Modelo ${v} salvo (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  await vendorUi();
  console.log('\nPronto. A partir daqui o sistema roda sem internet: `npm start`.');
}

// Fonte Inter (OFL) e ícones Lucide (ISC) servidos localmente — sem CDN.
// Para usar um ícone novo na interface, acrescente o nome aqui e rode `npm run setup`.
const ICONS = [
  'camera', 'video', 'monitor', 'cpu', 'activity', 'radio', 'signal', 'users', 'user', 'hand', 'footprints',
  'person-standing', 'accessibility', 'octagon-alert', 'triangle-alert', 'circle-alert', 'check', 'circle-check',
  'x', 'circle-x', 'play', 'square', 'power', 'rotate-ccw', 'refresh-cw', 'move', 'settings-2', 'sliders-horizontal',
  'download', 'external-link', 'eye', 'wifi-off', 'plug', 'usb', 'cable', 'database', 'shield-check', 'shield-alert',
  'gauge', 'timer', 'clock', 'scan-eye', 'layout-dashboard', 'presentation', 'graduation-cap', 'car-front', 'siren',
  'bell-ring', 'zap', 'chevron-right', 'arrow-right', 'arrow-up-right', 'maximize', 'keyboard', 'square-dashed',
  'pen-line', 'undo-2', 'save', 'info', 'lightbulb', 'circle-dot', 'crosshair', 'film', 'flask-conical', 'history',
  'file-down', 'mouse-pointer-click', 'map-pin',
];

async function vendorUi() {
  const fontsSrc = join(root, 'node_modules', '@fontsource', 'inter', 'files');
  const fontsDst = join(root, 'public', 'vendor', 'fonts');
  await mkdir(fontsDst, { recursive: true });
  for (const w of [300, 400, 500, 600, 700]) {
    await cp(join(fontsSrc, `inter-latin-${w}-normal.woff2`), join(fontsDst, `inter-${w}.woff2`));
  }
  console.log('✓ Fonte Inter copiada para public/vendor/fonts');

  const iconsSrc = join(root, 'node_modules', 'lucide-static', 'icons');
  const symbols = [];
  for (const name of ICONS) {
    const svg = await readFile(join(iconsSrc, `${name}.svg`), 'utf8');
    const inner = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
    symbols.push(`<symbol id="${name}" viewBox="0 0 24 24">${inner.replace(/\s*\n\s*/g, '')}</symbol>`);
  }
  const sprite = `<!-- Ícones Lucide v1.48.0 (ISC) — gerado por scripts/setup.js -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
  await writeFile(join(root, 'public', 'vendor', 'icons.svg'), sprite);
  console.log(`✓ ${ICONS.length} ícones Lucide em public/vendor/icons.svg`);
}

main().catch((err) => { console.error(err); process.exit(1); });
