// Basic, no-build static prototype for a parallel scripture reader
// - Collapsible sidebar with Book > Chapter nav
// - Sticky top bar to manage template (versions) and navigate
// - Chapter view renders each verse with selected versions in order

const STORAGE_KEY = 'absval.reader.v1';

// Demo data fallback (works offline via file://). On Pages we fetch JSON.
const DEMO = {
  versions: {
    'KJV': {
      family: 'bible.en',
      code: 'kjv',
      data: {
        Genesis: {
          1: {
            1: 'In the beginning God created the heaven and the earth.',
            2: 'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.',
            3: 'And God said, Let there be light: and there was light.'
          },
          2: {
            1: 'Thus the heavens and the earth were finished, and all the host of them.',
            2: 'And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made.',
            3: 'And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.'
          }
        }
      }
    },
    'KJV-AV.gpt-5': {
      family: 'bible.en',
      code: 'kjv_av_gpt5',
      data: {
        Genesis: {
          1: {
            1: 'At the origin, God brought forth the sky and the land.',
            2: 'The land lay formless and empty; darkness covered the deep as God’s Spirit moved over the waters.',
            3: 'God said, “Let there be light,” and there was light.'
          },
          2: {
            1: 'Thus the skies and the land, with all their host, were completed.',
            2: 'On the seventh day God finished the work and rested from it.',
            3: 'God blessed the seventh day and made it holy.'
          }
        }
      }
    },
    'KJV-AV.gpt4o-mini': {
      family: 'bible.en',
      code: 'kjv_av_gpt4o_mini',
      data: {
        Genesis: {
          1: {
            1: 'In the beginning, God made the sky above and the earth below.',
            2: 'The earth was shapeless and empty; darkness lay over the deep while God’s Spirit hovered over the waters.',
            3: 'Then God said, “Let there be light,” and light appeared.'
          },
          2: {
            1: 'So the heavens and the earth were finished, and all their array.',
            2: 'By the seventh day God had completed his work and rested.',
            3: 'God blessed the seventh day and set it apart as holy.'
          }
        }
      }
    },
    'NIV': {
      family: 'bible.en',
      code: 'niv',
      data: {
        Genesis: {
          1: {
            1: '[NIV demo placeholder]',
            2: '[NIV demo placeholder]',
            3: '[NIV demo placeholder]'
          },
          2: { 1: '[NIV demo placeholder]', 2: '[NIV demo placeholder]', 3: '[NIV demo placeholder]' }
        }
      }
    }
  }
};

const DEFAULT_STATE = {
  family: 'bible.en',
  book: 'Genesis',
  chapter: 1,
  versions: ['KJV', 'KJV-AV.gpt-5', 'KJV-AV.gpt4o-mini']
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const state = loadState();

// In-memory caches
const cache = {
  catalog: new Map(), // family -> { versions, books }
  chapters: new Map() // key -> { [verse]: text }
};

function cacheKey({ family, version, book, chapter }) {
  return `${family}|${version}|${book}|${chapter}`;
}

// Resolve relative paths against the script location so it works under
// both "/" and "/root/" (GitHub Pages folder deploys)
const BASE_URL = new URL('.', import.meta.url);

async function fetchJSON(url) {
  const abs = typeof url === 'string' ? new URL(url, BASE_URL) : url;
  const res = await fetch(abs, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function loadCatalog(family) {
  if (cache.catalog.has(family)) return cache.catalog.get(family);
  try {
    const data = await fetchJSON(`data/${encodeURIComponent(family)}/catalog.json`);
    cache.catalog.set(family, data);
    return data;
  } catch (e) {
    // Fallback to DEMO-derived catalog
    const versions = {};
    for (const [name, meta] of Object.entries(DEMO.versions)) {
      if (meta.family === family) versions[name] = { code: meta.code };
    }
    const books = {};
    const set = new Set();
    for (const v of Object.values(DEMO.versions)) {
      if (v.family !== family) continue;
      Object.keys(v.data).forEach((b) => set.add(b));
    }
    for (const b of set) {
      const chs = new Set();
      for (const v of Object.values(DEMO.versions)) {
        if (v.family !== family) continue;
        const book = v.data[b];
        if (book) Object.keys(book).forEach((c) => chs.add(Number(c)));
      }
      books[b] = Array.from(chs).sort((a, b) => a - b);
    }
    const fallback = { versions, books };
    cache.catalog.set(family, fallback);
    return fallback;
  }
}

async function loadChapter({ family, version, book, chapter }) {
  const key = cacheKey({ family, version, book, chapter });
  if (cache.chapters.has(key)) return cache.chapters.get(key);
  try {
    const data = await fetchJSON(`data/${encodeURIComponent(family)}/${encodeURIComponent(version)}/${encodeURIComponent(book)}/${encodeURIComponent(chapter)}.json`);
    cache.chapters.set(key, data);
    return data;
  } catch (e) {
    // Fallback to DEMO
    const meta = DEMO.versions[version];
    const d = meta?.data?.[book]?.[chapter] || {};
    cache.chapters.set(key, d);
    return d;
  }
}

// Ensure state consistency. Accepts an optional catalog to avoid referencing
// functions that depend on currentCatalog before it is set.
function sanitizeState(catalog) {
  const fam = state.family;
  const allowedVersions = catalog?.versions
    ? Object.keys(catalog.versions)
    : Object.keys(Object.fromEntries(Object.entries(DEMO.versions).filter(([k, v]) => v.family === fam)));

  // Versions within family only
  state.versions = (state.versions || []).filter((v) => allowedVersions.includes(v));
  if (!state.versions.length) state.versions = [...DEFAULT_STATE.versions];

  // Books from catalog, or DEMO fallback
  const bookList = catalog?.books ? Object.keys(catalog.books) : (() => {
    const s = new Set();
    for (const v of Object.values(DEMO.versions)) if (v.family === fam) Object.keys(v.data).forEach((b) => s.add(b));
    return Array.from(s);
  })();
  if (!bookList.includes(state.book)) state.book = bookList[0] || state.book || 'Genesis';

  // Chapters for current book
  const chapList = catalog?.books?.[state.book] || (() => {
    const s = new Set();
    for (const v of Object.values(DEMO.versions)) if (v.family === fam) {
      const b = v.data[state.book];
      if (b) Object.keys(b).forEach((c) => s.add(Number(c)));
    }
    return Array.from(s).sort((a, b) => a - b);
  })();
  if (!chapList.includes(state.chapter)) state.chapter = chapList[0] || 1;
}

// Catalog-backed helpers (populated in refreshAll)
let currentCatalog = { versions: {}, books: {} };

function getBooks(family = state.family) {
  return Object.keys(currentCatalog.books || {});
}

function getChapters(book, family = state.family) {
  return (currentCatalog.books?.[book] || []).slice();
}

function getMaxVerse(book, chapter) {
  // Unknown until chapters are fetched; caller now computes from fetched data.
  return 0;
}

function getText(versionName, book, chapter, verse) {
  const v = DEMO.versions[versionName];
  const txt = v?.data?.[book]?.[chapter]?.[verse];
  return txt ?? '[Not available]';
}

// UI refs
const els = {
  sidebar: document.getElementById('sidebar'),
  toggleSidebar: document.getElementById('toggle-sidebar'),
  navTree: document.getElementById('nav-tree'),
  bookSelect: document.getElementById('book-select'),
  addVersion: document.getElementById('add-version'),
  templateVersions: document.getElementById('template-versions'),
  chapterLabel: document.getElementById('chapter-label'),
  prevTop: document.getElementById('prev-chapter'),
  nextTop: document.getElementById('next-chapter'),
  prevBottom: document.getElementById('prev-chapter-bottom'),
  nextBottom: document.getElementById('next-chapter-bottom'),
  content: document.getElementById('chapter-content'),
  share: document.getElementById('share-link'),
  reset: document.getElementById('reset-state')
};

// Sidebar toggle
els.toggleSidebar.addEventListener('click', () => {
  els.sidebar.classList.toggle('collapsed');
});

function familyLabel(fam) {
  if (fam === 'bible.en') return 'Bible (EN)';
  return fam;
}

function buildNavTree() {
  const container = els.navTree;
  container.innerHTML = '';

  // Source group (only Bible in demo)
  const group = document.createElement('div');
  group.className = 'tree-group';
  const title = document.createElement('button');
  title.className = 'tree-title';
  title.innerHTML = `<span>▸</span><span>${familyLabel(state.family)}</span>`;
  const content = document.createElement('div');
  content.className = 'tree-content';
  content.style.display = 'none';

  title.addEventListener('click', () => {
    const open = content.style.display !== 'none';
    content.style.display = open ? 'none' : 'block';
    title.firstChild.textContent = open ? '▸' : '▾';
  });

  // Books
  const books = getBooks();
  for (const book of books) {
    const bookWrap = document.createElement('div');
    const bookBtn = document.createElement('button');
    bookBtn.className = 'tree-title';
    bookBtn.innerHTML = `<span>▸</span><span>${book}</span>`;
    const chaptersEl = document.createElement('div');
    chaptersEl.className = 'tree-content';
    chaptersEl.style.display = 'none';

    bookBtn.addEventListener('click', () => {
      const open = chaptersEl.style.display !== 'none';
      chaptersEl.style.display = open ? 'none' : 'block';
      bookBtn.firstChild.textContent = open ? '▸' : '▾';
    });

    // Chapters chips
    const chips = document.createElement('div');
    chips.className = 'chapter-list';
    for (const ch of getChapters(book)) {
      const btn = document.createElement('button');
      btn.className = 'chip-btn';
      btn.textContent = ch;
      if (state.book === book && state.chapter === ch) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.book = book;
        state.chapter = ch;
        saveState(state);
        refreshAll();
      });
      chips.appendChild(btn);
    }
    chaptersEl.appendChild(chips);
    bookWrap.appendChild(bookBtn);
    bookWrap.appendChild(chaptersEl);
    content.appendChild(bookWrap);
  }

  group.appendChild(title);
  group.appendChild(content);
  container.appendChild(group);
}

function populateBookSelect() {
  const books = getBooks();
  els.bookSelect.innerHTML = '';
  for (const b of books) {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    if (b === state.book) opt.selected = true;
    els.bookSelect.appendChild(opt);
  }
  els.bookSelect.addEventListener('change', () => {
    state.book = els.bookSelect.value;
    // Snap chapter to first available in this book
    const chs = getChapters(state.book);
    state.chapter = chs.length ? chs[0] : 1;
    saveState(state);
    syncURL();
    refreshAll();
  });
}

function populateAddVersion() {
  const existing = new Set(state.versions);
  els.addVersion.innerHTML = '<option value="">+ Add source…</option>';
  const all = Object.keys(currentCatalog.versions || {});
  for (const name of all) {
    if (existing.has(name)) continue;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.addVersion.appendChild(opt);
  }
  els.addVersion.onchange = () => {
    const v = els.addVersion.value;
    if (!v) return;
    state.versions.push(v);
    saveState(state);
    syncURL();
    els.addVersion.value = '';
    renderTemplateChips();
    renderChapter();
    populateAddVersion();
  };
}

function renderTemplateChips() {
  els.templateVersions.innerHTML = '';
  state.versions.forEach((name, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    const left = document.createElement('button');
    left.className = 'chip-action';
    left.title = 'Move left';
    left.textContent = '◀';
    left.disabled = idx === 0;
    left.addEventListener('click', () => {
      if (idx === 0) return;
      const v = state.versions.splice(idx, 1)[0];
      state.versions.splice(idx - 1, 0, v);
      saveState(state);
      syncURL();
      renderTemplateChips();
      renderChapter();
      populateAddVersion();
    });
    const right = document.createElement('button');
    right.className = 'chip-action';
    right.title = 'Move right';
    right.textContent = '▶';
    right.disabled = idx === state.versions.length - 1;
    right.addEventListener('click', () => {
      if (idx === state.versions.length - 1) return;
      const v = state.versions.splice(idx, 1)[0];
      state.versions.splice(idx + 1, 0, v);
      saveState(state);
      syncURL();
      renderTemplateChips();
      renderChapter();
      populateAddVersion();
    });
    const remove = document.createElement('button');
    remove.className = 'chip-action';
    remove.title = 'Remove';
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      state.versions = state.versions.filter((x) => x !== name);
      saveState(state);
      syncURL();
      renderTemplateChips();
      renderChapter();
      populateAddVersion();
    });

    chip.appendChild(left);
    chip.appendChild(label);
    chip.appendChild(right);
    chip.appendChild(remove);
    els.templateVersions.appendChild(chip);
  });
}

function updateChapterLabel() {
  els.chapterLabel.textContent = `${state.book} ${state.chapter}`;
}

async function renderChapter() {
  updateChapterLabel();
  els.content.innerHTML = '<div class="verse-block">Loading…</div>';

  // Fetch all selected versions for this chapter
  const tasks = state.versions.map((ver) => loadChapter({
    family: state.family,
    version: ver,
    book: state.book,
    chapter: state.chapter
  }).then((data) => ({ ver, data })).catch(() => ({ ver, data: {} })));
  const results = await Promise.all(tasks);

  // Determine union of verse numbers
  const verseSet = new Set();
  for (const { data } of results) {
    Object.keys(data || {}).forEach((k) => verseSet.add(Number(k)));
  }
  const verses = Array.from(verseSet).sort((a, b) => a - b);
  if (verses.length === 0) {
    els.content.innerHTML = '<div class="verse-block">No data for this chapter.</div>';
  } else {
    const frag = document.createDocumentFragment();
    for (const v of verses) {
      const block = document.createElement('div');
      block.className = 'verse-block';
      const ref = document.createElement('div');
      ref.className = 'verse-ref';
      ref.textContent = `${state.book} ${state.chapter}:${v}`;
      block.appendChild(ref);
      for (const { ver, data } of results) {
        const line = document.createElement('div');
        line.className = 'line';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = ver;
        const text = document.createElement('div');
        text.className = 'text';
        text.textContent = data?.[v] ?? '[Not available]';
        line.appendChild(label);
        line.appendChild(text);
        block.appendChild(line);
      }
      frag.appendChild(block);
    }
    els.content.innerHTML = '';
    els.content.appendChild(frag);
  }

  // Update prev/next enabled
  const chapters = getChapters(state.book);
  const idx = chapters.indexOf(state.chapter);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < chapters.length - 1;
  for (const btn of [els.prevTop, els.prevBottom]) btn.disabled = !hasPrev;
  for (const btn of [els.nextTop, els.nextBottom]) btn.disabled = !hasNext;
}

function hookNavButtons() {
  function step(delta) {
    const chapters = getChapters(state.book);
    const idx = chapters.indexOf(state.chapter);
    if (idx < 0) return;
    const next = chapters[idx + delta];
    if (typeof next !== 'number') return;
    state.chapter = next;
    saveState(state);
    syncURL();
    refreshAll();
  }
  els.prevTop.addEventListener('click', () => step(-1));
  els.nextTop.addEventListener('click', () => step(1));
  els.prevBottom.addEventListener('click', () => step(-1));
  els.nextBottom.addEventListener('click', () => step(1));

  // Keyboard arrows left/right for prev/next
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
}

async function refreshAll() {
  // Load catalog, then rebuild everything dependent on it
  const catalog = await loadCatalog(state.family);
  currentCatalog = catalog || { versions: {}, books: {} };
  // Ensure state still valid after catalog load
  sanitizeState(catalog);
  buildNavTree();
  populateBookSelect();
  populateAddVersion();
  renderTemplateChips();
  renderChapter();
  syncURL();
}

// Initial render
// Simple URL sync (deep-linking)
function buildShareURL() {
  const usp = new URLSearchParams();
  usp.set('family', state.family);
  usp.set('book', state.book);
  usp.set('chapter', String(state.chapter));
  if (state.versions?.length) usp.set('v', state.versions.map(encodeURIComponent).join(','));
  const base = window.location.origin + window.location.pathname;
  return `${base}?${usp.toString()}`;
}

function syncURL() {
  const url = buildShareURL();
  try {
    window.history.replaceState(null, '', url);
  } catch (_) {
    // no-op
  }
}

function initFromURL() {
  try {
    const usp = new URLSearchParams(window.location.search);
    const fam = usp.get('family');
    const book = usp.get('book');
    const ch = usp.get('chapter');
    const v = usp.get('v');
    if (fam) state.family = fam;
    if (book) state.book = book;
    if (ch) state.chapter = Math.max(1, Number(ch) || 1);
    if (v) state.versions = v.split(',').map(decodeURIComponent).filter(Boolean);
  } catch (_) {
    // ignore malformed URLs
  }
}

// Share & Reset handlers
function hookTopbarExtras() {
  if (els.share) {
    els.share.addEventListener('click', async () => {
      const url = buildShareURL();
      try {
        await navigator.clipboard.writeText(url);
        els.share.textContent = 'Copied!';
        setTimeout(() => (els.share.textContent = 'Share'), 1000);
      } catch (_) {
        window.prompt('Copy link:', url);
      }
    });
  }
  if (els.reset) {
    els.reset.addEventListener('click', () => {
      state.family = DEFAULT_STATE.family;
      state.book = DEFAULT_STATE.book;
      state.chapter = DEFAULT_STATE.chapter;
      state.versions = [...DEFAULT_STATE.versions];
      saveState(state);
      syncURL();
      refreshAll();
    });
  }
}

hookNavButtons();
hookTopbarExtras();
initFromURL();
refreshAll();
