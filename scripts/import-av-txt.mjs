#!/usr/bin/env node
// Parse AV .txt exports like:
//   Genesis 1:1\tAt the origin, God brought forth the sky and the land.
// and write into root/data/bible.en/<Source>/<Book>/<Chapter>.json
// Existing files are merged (we overwrite verses that appear in the .txt).

import fs from 'node:fs/promises';
import path from 'node:path';

const [,, sourceName, inputPath] = process.argv;
if (!sourceName || !inputPath) {
  console.error('Usage: node scripts/import-av-txt.mjs <SourceName> <InputTxtPath>');
  console.error('Example: node scripts/import-av-txt.mjs "KJV-AV.gpt-5" "Output/Holy Bible/KJV.Genesis.gpt-5.medium.AV.txt"');
  process.exit(1);
}

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const TARGET_BASE = path.join(FAMILY_DIR, sourceName);

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
async function readFileUtf8(p) { return fs.readFile(p, 'utf8'); }
async function readJsonSafe(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return {}; }
}

function normalizeBook(name) {
  // Normalize common variants just in case (e.g., Psalm -> Psalms)
  const map = new Map([
    ['Psalm', 'Psalms'],
    ['Song of Songs', 'Song of Solomon']
  ]);
  return map.get(name) || name;
}

function parseLine(line) {
  // Accept TAB or multiple spaces between ref and text
  // Capture book (any text), chapter, verse, then remainder as text
  const m = line.match(/^\s*(.+?)\s+(\d+):(\d+)\s*[\t ]\s*(.+)\s*$/);
  if (!m) return null;
  const book = normalizeBook(m[1].trim());
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  const text = m[4].trim();
  if (!book || !chapter || !verse || text.length === 0) return null;
  return { book, chapter, verse, text };
}

async function main() {
  const raw = await readFileUtf8(inputPath);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const buckets = new Map(); // key: book|chapter -> {book, chapter, verses:{}}

  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    const key = `${p.book}|${p.chapter}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { book: p.book, chapter: p.chapter, verses: {} };
      buckets.set(key, bucket);
    }
    bucket.verses[String(p.verse)] = p.text;
  }

  let written = 0, merged = 0;
  for (const bucket of buckets.values()) {
    const dir = path.join(TARGET_BASE, bucket.book);
    const file = path.join(dir, `${bucket.chapter}.json`);
    await ensureDir(dir);
    const existing = await readJsonSafe(file);
    const mergedObj = { ...existing, ...bucket.verses };
    const changed = JSON.stringify(existing) !== JSON.stringify(mergedObj);
    if (changed) {
      await fs.writeFile(file, JSON.stringify(mergedObj, null, 2) + '\n', 'utf8');
      written++;
    } else {
      merged++;
    }
  }
  console.log(`Imported ${written} chapter files (+${merged} unchanged) into ${sourceName}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

