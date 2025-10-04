#!/usr/bin/env node
// Collect AV outputs into a tagged .txt and import to site data.
// Usage:
//   node scripts/collect-av.mjs <SourceName> <RequestsMapJson> <ResultsJsonl> [--writeTxt <out.txt>] [--import]
// Produces a TSV with "Book C:V\t<text>" using the 'tag' from the map file,
// and optionally writes per-chapter JSON under root/data/bible.en/<Source>/.

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node scripts/collect-av.mjs <SourceName> <RequestsMapJson> <ResultsJsonl> [--writeTxt <out.txt>] [--import]');
  process.exit(1);
}

const [sourceName, mapPath, resultsPath, ...rest] = args;
let writeTxtPath = null;
let doImport = false;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--writeTxt') { writeTxtPath = rest[++i]; }
  else if (rest[i] === '--import') { doImport = true; }
}

const ROOT = path.resolve('root');
const FAMILY_DIR = path.join(ROOT, 'data', 'bible.en');
const TARGET_BASE = path.join(FAMILY_DIR, sourceName);

function parseTagToRef(tag) {
  // Ex: "Psalm 3:2\t" -> { book:"Psalms", chapter:3, verse:2 }
  tag = tag.replace(/\s+$/, '');
  const m = tag.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!m) return null;
  let book = m[1];
  if (book === 'Psalm') book = 'Psalms';
  return { book, chapter: Number(m[2]), verse: Number(m[3]) };
}

async function readLines(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw.split(/\r?\n/).filter(Boolean);
}

async function readJSON(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

async function importToSite(records) {
  const byChapter = new Map(); // key book|chapter -> map verse->text
  for (const r of records) {
    const key = `${r.book}|${r.chapter}`;
    let vv = byChapter.get(key); if (!vv) { vv = { book: r.book, chapter: r.chapter, verses: {} }; byChapter.set(key, vv); }
    vv.verses[String(r.verse)] = r.text;
  }
  let written = 0;
  for (const v of byChapter.values()) {
    const dir = path.join(TARGET_BASE, v.book);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${v.chapter}.json`);
    await fs.writeFile(file, JSON.stringify(v.verses, null, 2) + '\n', 'utf8');
    written++;
  }
  return written;
}

async function main() {
  const map = await readJSON(mapPath);
  const lines = await readLines(resultsPath);
  // Build a lookup from custom_id -> output text (assuming JSONL with {custom_id, response{... or output}})
  const outputs = new Map();
  for (const ln of lines) {
    try {
      const obj = JSON.parse(ln);
      const id = obj.custom_id || obj.id || obj.request_id;
      // Try several likely shapes for content
      let text = null;
      if (obj.response?.output?.[0]?.content?.[0]?.text) text = obj.response.output[0].content[0].text;
      else if (obj.output?.[0]?.content?.[0]?.text) text = obj.output[0].content[0].text;
      else if (obj.response?.data?.[0]?.text) text = obj.response.data[0].text;
      else if (obj.text) text = obj.text;
      if (id && text != null) outputs.set(id, String(text));
    } catch { /* ignore parse errors */ }
  }

  const records = [];
  for (const e of map.entries) {
    const id = e.custom_id;
    const out = outputs.get(id);
    if (!out) continue;
    const ref = parseTagToRef((e.tag || '').trim());
    if (!ref) continue;
    records.push({ ...ref, text: out });
  }

  // Optional: write TSV
  if (writeTxtPath) {
    const tsv = records.map(r => `${r.book} ${r.chapter}:${r.verse}\t${r.text}`).join('\n') + '\n';
    await fs.writeFile(writeTxtPath, tsv, 'utf8');
  }

  if (doImport) {
    const n = await importToSite(records);
    console.log(`Imported ${n} chapter files into ${sourceName}`);
  } else {
    console.log(`Collected ${records.length} verse records.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

