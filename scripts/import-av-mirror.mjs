#!/usr/bin/env node
// Import AV mirror.txt (plain lines) using the paired requests map to restore
// tags/refs, then write into site chapter JSONs.
// Usage: node scripts/import-av-mirror.mjs <SourceName> <MirrorTxtPath> [--writeTxt <out.txt>]

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const sourceName = args[0];
const mirrorPath = args[1];
let writeTxtPath = null;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--writeTxt') writeTxtPath = args[++i];
}

if (!sourceName || !mirrorPath) {
  console.error('Usage: node scripts/import-av-mirror.mjs <SourceName> <MirrorTxtPath> [--writeTxt <out.txt>]');
  process.exit(1);
}

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const TARGET_BASE = path.join(FAMILY_DIR, sourceName);

function mapPathFromMirror(p) {
  const dir = path.dirname(p);
  const name = path.basename(p).replace('.AV.mirror.txt', '.AV.requests.jsonl.map.json');
  return path.join(dir, name);
}

function normalizeBook(name) {
  if (name === 'Psalm') return 'Psalms';
  return name;
}

function parseTag(tag) {
  const t = String(tag || '').trim().replace(/\t+$/, '');
  const m = t.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!m) return null;
  return { book: normalizeBook(m[1]), chapter: Number(m[2]), verse: Number(m[3]) };
}

async function main() {
  const mapPath = mapPathFromMirror(mirrorPath);
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const lines = (await fs.readFile(mirrorPath, 'utf8')).split(/\r?\n/).filter(Boolean);
  const entries = Array.isArray(map.entries) ? map.entries : [];

  const n = Math.min(entries.length, lines.length);
  if (n === 0) throw new Error('No records to import');
  if (entries.length !== lines.length) {
    console.warn(`Warning: length mismatch: entries=${entries.length} lines=${lines.length}; importing ${n}`);
  }

  const chapters = new Map(); // key book|chapter -> verses obj
  const outRecords = []; // for optional tagged txt
  for (let i = 0; i < n; i++) {
    const ref = parseTag(entries[i].tag);
    if (!ref) continue;
    const text = lines[i].trim();
    const key = `${ref.book}|${ref.chapter}`;
    let vv = chapters.get(key);
    if (!vv) { vv = {}; chapters.set(key, vv); }
    vv[String(ref.verse)] = text;
    outRecords.push(`${ref.book} ${ref.chapter}:${ref.verse}\t${text}`);
  }

  let written = 0;
  for (const [key, verses] of chapters.entries()) {
    const [book, chStr] = key.split('|');
    const dir = path.join(TARGET_BASE, book);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Number(chStr)}.json`);
    await fs.writeFile(file, JSON.stringify(verses, null, 2) + '\n', 'utf8');
    written++;
  }
  if (writeTxtPath) {
    await fs.writeFile(writeTxtPath, outRecords.join('\n') + '\n', 'utf8');
    console.log(`Wrote tagged TSV: ${writeTxtPath}`);
  }
  console.log(`Imported ${written} chapters into ${sourceName} from mirror.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
