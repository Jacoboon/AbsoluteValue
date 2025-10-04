#!/usr/bin/env node
// Verify coverage of a target source against KJV baseline for given books.
// Prints per-book and per-chapter missing verse counts and a total percent.

import fs from 'node:fs/promises';
import path from 'node:path';

const [,, targetSource, ...bookArgs] = process.argv;
if (!targetSource) {
  console.error('Usage: node scripts/verify-coverage.mjs <TargetSource> [Book [Book ...]]');
  process.exit(1);
}

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const KJV_DIR = path.join(FAMILY_DIR, 'KJV');
const TARGET_BASE = path.join(FAMILY_DIR, targetSource);
const CATALOG_PATH = path.join(FAMILY_DIR, 'catalog.json');

async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function safeJSON(file) {
  try { return await readJSON(file); } catch { return {}; }
}

function countVerses(obj) {
  return Object.keys(obj || {}).length;
}

function isFilled(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }

async function verifyBook(book, chapters) {
  let bookTotal = 0, bookFilled = 0;
  let lines = [];
  for (const ch of chapters) {
    const base = await safeJSON(path.join(KJV_DIR, book, `${ch}.json`));
    const tgt = await safeJSON(path.join(TARGET_BASE, book, `${ch}.json`));
    const verses = Object.keys(base).map((x) => Number(x)).sort((a,b)=>a-b);
    const need = verses.length;
    let have = 0;
    for (const v of verses) { if (isFilled(tgt[String(v)])) have++; }
    const missing = need - have;
    lines.push({ ch, need, missing });
    bookTotal += need; bookFilled += have;
  }
  return { book, bookTotal, bookFilled, lines };
}

async function main() {
  const catalog = await readJSON(CATALOG_PATH);
  let books = bookArgs && bookArgs.length ? bookArgs : Object.keys(catalog.books || {});
  // comma-separated
  if (books.length === 1 && books[0].includes(',')) books = books[0].split(',').map(s=>s.trim()).filter(Boolean);

  let grandTotal = 0, grandFilled = 0;
  for (const book of books) {
    const chapters = catalog.books?.[book];
    if (!Array.isArray(chapters) || chapters.length === 0) {
      console.warn(`Skipping unknown book: ${book}`);
      continue;
    }
    const { bookTotal, bookFilled, lines } = await verifyBook(book, chapters);
    grandTotal += bookTotal; grandFilled += bookFilled;
    const pct = bookTotal ? Math.round((bookFilled / bookTotal) * 10000) / 100 : 100;
    console.log(`\n${book}: ${bookFilled}/${bookTotal} (${pct}%)`);
    for (const row of lines) {
      if (row.missing === 0) continue;
      console.log(`  ch ${row.ch}: missing ${row.missing}/${row.need}`);
    }
  }
  const gpct = grandTotal ? Math.round((grandFilled / grandTotal) * 10000) / 100 : 100;
  console.log(`\nTOTAL for ${targetSource}: ${grandFilled}/${grandTotal} (${gpct}%)`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });

