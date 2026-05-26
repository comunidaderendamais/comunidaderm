import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webDir = path.resolve(__dirname, '..');
const dstDir = path.resolve(webDir, 'public', 'apn');

await fs.mkdir(dstDir, { recursive: true });

const mappings = [
  { from: 'APN_RENDA_MAIS_BR.pdf', to: 'APN_RENDA_MAIS_BR.pdf' },
  { from: 'APN_RENDA_MAIS EN-US.pdf', to: 'APN_RENDA_MAIS_EN-US.pdf' },
  { from: 'APN_RENDA_MAIS_ES-ES.pdf', to: 'APN_RENDA_MAIS_ES-ES.pdf' },
  { from: 'APN_RENDA_MAIS_FR-RANÇA.pdf', to: 'APN_RENDA_MAIS_FR-FR.pdf' },
];

const srcDirCandidates = [
  path.resolve(webDir, '..', 'apn'),
  path.resolve(webDir, 'apn'),
  path.resolve(webDir, 'public', 'apn'),
];

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const missing = [];

await Promise.all(
  mappings.map(async ({ from, to }) => {
    const dst = path.resolve(dstDir, to);

    if (await exists(dst)) {
      return;
    }

    for (const candidateDir of srcDirCandidates) {
      const src = path.resolve(candidateDir, from);
      if (await exists(src)) {
        await fs.copyFile(src, dst);
        return;
      }
    }

    missing.push(from);
  })
);

if (missing.length) {
  throw new Error(
    `APN PDFs ausentes. Adicione os arquivos em "${dstDir}" (recomendado para Cloudflare Pages) ou em uma pasta "apn" no nivel acima do projeto. Faltando: ${missing.join(', ')}`
  );
}
