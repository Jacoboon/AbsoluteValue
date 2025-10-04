#!/usr/bin/env node
// Seed a target source with KJV text for specified books, preserving any
// existing verse renderings. This ensures complete coverage for demos while
// allowing you to revise verses later.

import fs from 'node:fs/promises';
import path from 'node:path';

const [,, targetSource, ...bookArgs] = process.argv;
if (!targetSource) {
  console.error('Usage: node scripts/seed-from-kjv.mjs <TargetSource> [Book [Book ...]]');
  console.error('Example: node scripts/seed-from-kjv.mjs "KJV-AV.gpt-5" Genesis');
  process.exit(1);
}

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const KJV_DIR = path.join(FAMILY_DIR, 'KJV');
const TARGET_BASE = path.join(FAMILY_DIR, targetSource);
const CATALOG_PATH = path.join(FAMILY_DIR, 'catalog.json');

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function readJsonSafe(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(fallback)); }
}

function nonEmpty(x) { return x !== undefined && x !== null && String(x).trim() !== ''; }

async function seedBook(book) {
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
  const chapters = catalog.books?.[book];
  if (!Array.isArray(chapters) || chapters.length === 0)
    throw new Error(`Book not in catalog: ${book}`);

  const targetDir = path.join(TARGET_BASE, book);
  await ensureDir(targetDir);

  let changed = 0;
  for (const ch of chapters) {
    const kjvFile = path.join(KJV_DIR, book, `${ch}.json`);
    const tgtFile = path.join(targetDir, `${ch}.json`);
    const kjv = await readJsonSafe(kjvFile, {});
    const tgt = await readJsonSafe(tgtFile, {});

    let modified = false;
    for (const [vnum, text] of Object.entries(kjv)) {
      if (!nonEmpty(tgt[vnum])) {
        tgt[vnum] = text;
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(tgtFile, JSON.stringify(tgt, null, 2) + '\n', 'utf8');
      changed++;
    }
  }
  console.log(`Seeded ${book} for ${targetSource}: wrote ${changed} chapters (filled missing verses).`);
}

async function main() {
  let books = bookArgs && bookArgs.length ? bookArgs : ['Genesis'];
  // Support comma-separated single arg
  if (books.length === 1 && books[0].includes(',')) books = books[0].split(',').map(s => s.trim()).filter(Boolean);
  for (const book of books) {
    await seedBook(book);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

