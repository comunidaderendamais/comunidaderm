import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(webDir, '..', 'apn');
const dstDir = path.resolve(webDir, 'public', 'apn');

await fs.mkdir(dstDir, { recursive: true });

const mappings = [
  { from: 'APN_RENDA_MAIS_BR.pdf', to: 'APN_RENDA_MAIS_BR.pdf' },
  { from: 'APN_RENDA_MAIS EN-US.pdf', to: 'APN_RENDA_MAIS_EN-US.pdf' },
  { from: 'APN_RENDA_MAIS_ES-ES.pdf', to: 'APN_RENDA_MAIS_ES-ES.pdf' },
  { from: 'APN_RENDA_MAIS_FR-RANÇA.pdf', to: 'APN_RENDA_MAIS_FR-FR.pdf' },
];

const missing = [];

await Promise.all(
  mappings.map(async ({ from, to }) => {
    const src = path.resolve(srcDir, from);
    const dst = path.resolve(dstDir, to);
    try {
      await fs.copyFile(src, dst);
    } catch {
      missing.push(from);
    }
  })
);

if (missing.length) {
  throw new Error(`APN PDFs ausentes em ${srcDir}: ${missing.join(', ')}`);
}
