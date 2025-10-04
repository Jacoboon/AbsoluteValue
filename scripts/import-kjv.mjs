#!/usr/bin/env node
// Import full KJV from a public JSON and write into
// root/data/bible.en/KJV/<Book>/<Chapter>.json
// Also updates root/data/bible.en/catalog.json books list.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const KJV_DIR = path.join(FAMILY_DIR, 'KJV');
const CATALOG_PATH = path.join(FAMILY_DIR, 'catalog.json');
const SRC_URL = 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json';

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function normalizeVerseText(t) {
  // Keep text as-is; trim only trailing/leading whitespace
  return String(t ?? '').trim();
}

async function writeChapter(bookName, chapterIndex, versesArray) {
  // versesArray is an array of strings (1-indexed conceptually)
  const obj = {};
  for (let i = 0; i < versesArray.length; i++) {
    const vnum = String(i + 1);
    obj[vnum] = normalizeVerseText(versesArray[i]);
  }
  const dir = path.join(KJV_DIR, bookName);
  await ensureDir(dir);
  const file = path.join(dir, `${chapterIndex}.json`);
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function chapterCountArray(n) {
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(i);
  return arr;
}

async function updateCatalog(booksMap) {
  let catalog = { versions: {}, books: {} };
  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf8');
    catalog = JSON.parse(raw);
  } catch (_) {
    // default structure
    catalog = { versions: {
      'KJV': { code: 'kjv' },
      'KJV-AV.gpt-5': { code: 'kjv_av_gpt5' },
      'KJV-AV.gpt4o-mini': { code: 'kjv_av_gpt4o_mini' }
    }, books: {} };
  }

  // Merge: prefer new books map. Keep versions as-is or add KJV if missing
  catalog.books = booksMap;
  if (!catalog.versions) catalog.versions = {};
  if (!catalog.versions['KJV']) catalog.versions['KJV'] = { code: 'kjv' };

  await ensureDir(path.dirname(CATALOG_PATH));
  await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
}

async function main() {
  console.log('Downloading KJV JSON...');
  const data = await fetchJSON(SRC_URL);
  // Expected structure: [{ name: 'Genesis', chapters: [ [verse1, verse2, ...], ... ] }, ...]
  if (!Array.isArray(data)) throw new Error('Unexpected KJV JSON format');

  const booksMap = {};
  await ensureDir(KJV_DIR);

  for (const book of data) {
    const name = book.name || book.book || book.abbrev || 'Unknown';
    if (!Array.isArray(book.chapters)) continue;
    const chapters = book.chapters;
    booksMap[name] = chapterCountArray(chapters.length);

    for (let ci = 0; ci < chapters.length; ci++) {
      const chapterNum = ci + 1;
      const verses = chapters[ci];
      if (!Array.isArray(verses)) continue;
      await writeChapter(name, chapterNum, verses);
    }
  }

  await updateCatalog(booksMap);
  console.log('Import complete. Books:', Object.keys(booksMap).length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

