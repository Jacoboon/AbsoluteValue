#!/usr/bin/env node
// Create placeholder chapter JSON files for a source and book using the
// catalog's chapter counts. Useful when preparing AV variants.

import fs from 'node:fs/promises';
import path from 'node:path';

const [,, sourceName, bookName] = process.argv;
if (!sourceName || !bookName) {
  console.error('Usage: node scripts/scaffold-source-book.mjs <Source> <Book>');
  console.error('Example: node scripts/scaffold-source-book.mjs "KJV-AV.gpt-5" "Exodus"');
  process.exit(1);
}

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const TARGET_DIR = path.join(FAMILY_DIR, sourceName, bookName);
const CATALOG_PATH = path.join(FAMILY_DIR, 'catalog.json');

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function main() {
  const cat = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
  const chapters = cat.books?.[bookName];
  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error(`Book not found in catalog: ${bookName}`);
  }
  await ensureDir(TARGET_DIR);
  for (const ch of chapters) {
    const file = path.join(TARGET_DIR, `${ch}.json`);
    try {
      await fs.access(file);
      continue; // already exists
    } catch {}
    await fs.writeFile(file, '{}\n', 'utf8');
  }
  console.log(`Scaffolded ${chapters.length} chapter files for ${sourceName}/${bookName}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

