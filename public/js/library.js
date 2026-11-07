import { api } from './api.js';
import { icon } from './icons.js';
import { propLabel, propOptions } from './props.js';
import { handleNav } from './shell.js';
import { state } from './state.js';
import { escapeHtml as h } from './ui.js';


/* ============================================================
   The reference libraries: Tests and Findings
   ------------------------------------------------------------
   Two pages, one shape: a filter bar, a count, and the material. They read as
   one body of knowledge because they answer the two halves of the same
   question — "how do I test this?" and "what do I write when it fails?" — and
   they link to each other: a guide lists the findings it produces, a finding
   opens the test that proves it.

   Read-only. The content ships with the code (`server/knowledge.js`) because it
   is fixed reference text, not something the team creates; every page that does
   mutate lives behind the Admin panel instead.

   Filtering happens here, over the whole payload, for a reason: the library is
   a few dozen kilobytes and a round-trip per keystroke would be slower than the
   filter itself. The count is always "showing N of M" over the whole library,
   so a filter can never hide material without saying so.
   ============================================================ */

const SEVERITY_TONE = { Critical: 'rose', High: 'amber', Medium: 'blue', Low: 'slate' };
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

const lower = (v) => String(v ?? '').toLowerCase();

/**
 * One field's values, in the order the library lists them. Both pages divide by
 * category rather than showing one undifferentiated column, because a reader
 * arrives looking for "the injection ones", not for item 14 of 20.
 */
function categoriesOf(rows, field) {
  return [...new Set(rows.map((r) => r[field]).filter(Boolean))];
}

/**
 * The category vocabulary of the whole app, not of this one page: the live
 * project categories an admin maintains in Properties, plus any value the
 * library names that the list does not. A library that invented its own two
 * categories disagreed with every project screen, and a category the properties
 * list lost would have hidden its rows silently.
 */
function categoryOptions(rows = [], field = 'area') {
  const opts = propOptions('category').map((o) => ({ key: o.value, label: o.label }));
  const known = new Set(opts.map((o) => o.key));
  for (const key of categoriesOf(rows, field)) if (!known.has(key)) opts.push({ key, label: key });
  return opts.length ? opts : categoriesOf(rows, field).map((key) => ({ key, label: key }));
}

/** The order groups and chips are drawn in: the property list's order first. */
function categoryOrder(rows, field) {
  const order = categoryOptions(rows, field).map((o) => o.key);
  for (const key of categoriesOf(rows, field)) if (!order.includes(key)) order.push(key);
  return order;
}

/** Rows bucketed by one field, in category order. */
function groupRows(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[field] || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const order = categoryOrder(rows, field);
  return [...groups.entries()].sort(
    (a, b) => (order.indexOf(a[0]) + 1 || 1e6) - (order.indexOf(b[0]) + 1 || 1e6)
  );
}

/** A grouped index: the category, how many rows it holds, then the rows. */
function groupedHTML(rows, field, itemHTML) {
  if (!rows.length) return `<div class="lib-none">Nothing matches.</div>`;
  return groupRows(rows, field)
    .map(
      ([name, group]) => `<div class="lib-group" role="group" aria-label="${h(propLabel('category', name))}">
          <div class="lib-group-head">${h(propLabel('category', name))}<span class="n">${group.length}</span></div>
          ${group.map(itemHTML).join('')}
        </div>`
    )
    .join('');
}

/**
 * The category chips, from the same list the projects use. A category this library
 * cannot fill yet still gets a chip — greyed and disabled — because hiding it would
 * read as "this category does not exist", when the truth is "no entries yet".
 */
function categoryChipsHTML(rows = [], field = 'area', attr, active = '') {
  const counts = new Map();
  for (const row of rows) counts.set(row[field], (counts.get(row[field]) || 0) + 1);
  const chip = (key, label, count) =>
    `<button class="chip${active === key ? ' active' : ''}" type="button" ${attr}="${h(key)}"${
      count ? '' : ` disabled title="No entries in ${h(label)} yet"`
    }>${h(label)}<span class="n">${count}</span></button>`;
  return [chip('', 'All', rows.length), ...categoryOptions(rows, field).map((o) => chip(o.key, o.label, counts.get(o.key) || 0))].join('');
}


/* ------------------------------------------------------------
   Tests
   ------------------------------------------------------------ */

/** Every string in a guide, so search does not stop at the title. */
function guideText(g) {
  return [g.code, g.area, g.category, g.title, g.checklistName, g.what, g.tools?.join(' '), ...(g.steps || []), ...(g.passes || []), ...(g.watch || [])]
    .join(' ')
    .toLowerCase();
}

function testMatches(g) {
  if (state.testCategory && g.category !== state.testCategory) return false;
  const q = lower(state.testQuery).trim();
  if (!q) return true;
  return guideText(g).includes(q);
}

/** The guides the current filter admits, in the order the book lists them. */
export function visibleGuides() {
  return (state.tests || []).filter(testMatches);
}

/** The open guide: the remembered one if it survived the filter, else the first. */
export function openGuide() {
  const rows = visibleGuides();
  const chosen = rows.find((g) => g.id === state.testId);
  return chosen || rows[0] || null;
}

function guideItemHTML(g) {
  return `<button class="lib-item" type="button" data-test="${h(g.id)}">
      <span class="lib-code">${h(g.code.split(':')[0])}</span>
      <span class="lib-item-body">
        <span class="lib-item-title">${h(g.title)}</span>
        <span class="lib-item-sub">${h(propLabel('category', g.category))} · ${h(g.code.split(':')[1] || '')}</span>
      </span>
    </button>`;
}

function bulletList(items = [], cls = '') {
  if (!items.length) return '';
  return `<ul class="lib-bullets${cls ? ` ${cls}` : ''}">${items.map((t) => `<li>${h(t)}</li>`).join('')}</ul>`;
}

/** The findings this guide produces, as buttons that jump to the finding. */
function guideFindingsHTML(guideId) {
  const rows = (state.findings || []).filter((f) => f.guide === guideId);
  if (!rows.length) return '';
  return `<section class="guide-section">
      <h3 class="lib-h">Findings this test produces</h3>
      <div class="lib-links">${rows
        .map(
          (f) =>
            `<button class="lib-link" type="button" data-find="${h(f.id)}">
               <span class="lib-sev" data-tone="${SEVERITY_TONE[f.severity] || 'slate'}">${h(f.severity)}</span>
               ${h(f.title)}
             </button>`
        )
        .join('')}</div>
    </section>`;
}

function guideDetailHTML(g) {
  if (!g) {
    return `<div class="lib-empty">
        <div class="lib-empty-title">No guide matches that search</div>
        <p>Try a risk name ("access control"), a tool ("sqlmap") or clear the box.</p>
      </div>`;
  }
  return `<article class="guide" data-guide="${h(g.id)}">
      <header class="guide-head">
        <div class="guide-code">${h(g.code)}</div>
        <h2 class="guide-title">${h(g.title)}</h2>
        <div class="guide-meta">
          <span class="badge" data-tone="slate">${h(propLabel('category', g.category))}</span>
          <span class="guide-from">${icon.shield(13)} ${h(g.checklistName || g.checklist)}</span>
        </div>
      </header>

      <p class="guide-what">${h(g.what)}</p>

      <section class="guide-section">
        <h3 class="lib-h">How to test it</h3>
        <ol class="guide-steps">${(g.steps || []).map((s) => `<li>${h(s)}</li>`).join('')}</ol>
      </section>

      <section class="guide-section">
        <h3 class="lib-h">What a pass looks like</h3>
        ${bulletList(g.passes)}
      </section>

      <section class="guide-section">
        <h3 class="lib-h">Tools</h3>
        <div class="guide-tools">${(g.tools || []).map((t) => `<span class="guide-tool">${h(t)}</span>`).join('')}</div>
      </section>

      <section class="guide-section">
        <h3 class="lib-h">Where people get it wrong</h3>
        ${bulletList(g.watch, 'is-watch')}
      </section>

      ${guideAskedHTML(g)}
      ${guideFindingsHTML(g.id)}
    </article>`;
}

/**
 * "Where this is asked" — the checklist rows that open this guide. A guide nobody
 * asks about is a guide nobody uses, so the section simply disappears rather than
 * printing an empty heading.
 */
function guideAskedHTML(g) {
  const asked = g.asked || [];
  if (!asked.length) return '';
  return `<section class="guide-section" data-guide-asked>
        <h3 class="lib-h">Where this is asked</h3>
        <ul class="guide-asked">${asked
          .map(
            (a) =>
              `<li><span class="guide-asked-name">${h(a.checklistName)}</span>${
                a.items ? `<span class="guide-asked-n">${a.items} ${a.items === 1 ? 'item' : 'items'}</span>` : ''
              }</li>`
          )
          .join('')}</ul>
      </section>`;
}

/** The category chips, taken from the checklist each guide belongs to. */
function testCategoryChipsHTML() {
  return categoryChipsHTML(state.tests || [], 'category', 'data-test-cat', state.testCategory || '');
}

/** The list, the count and the open guide — everything but the shell. */
function paintTests() {
  const list = document.getElementById('test-list');
  const detail = document.getElementById('test-detail');
  const count = document.getElementById('test-count');
  const areas = document.getElementById('test-areas');
  if (!list || !detail || !count) return;
  if (areas) areas.innerHTML = testCategoryChipsHTML();

  const rows = visibleGuides();
  const open = openGuide();
  if (open && state.testId !== open.id) state.testId = open.id;

  count.innerHTML = `<b>${rows.length}</b> of ${(state.tests || []).length} guides`;
  list.innerHTML = groupedHTML(rows, 'category', guideItemHTML);
  list.querySelectorAll('[data-test]').forEach((b) => {
    b.classList.toggle('is-open', b.dataset.test === state.testId);
    b.setAttribute('aria-pressed', String(b.dataset.test === state.testId));
  });
  detail.innerHTML = guideDetailHTML(open);
}

export function testsPageHTML() {
  return `<div class="lib-page" data-lib="tests">
      <div class="lib-bar">
        <label class="lib-search">
          ${icon.search()}
          <input id="test-search" type="search" autocomplete="off" spellcheck="false"
                 placeholder="Search guides — a risk, a tool, a word from a step"
                 value="${h(state.testQuery)}" aria-label="Search testing guides">
        </label>
        <div class="chips" id="test-areas" role="group" aria-label="Filter by category"></div>
      </div>
      <div class="lib-count" id="test-count"></div>
      <div class="lib-split">
        <div class="lib-list" id="test-list" aria-label="Guides"></div>
        <div class="lib-detail" id="test-detail"></div>
      </div>
    </div>`;
}

/**
 * Wire the page. Bound to the freshly rendered wrapper, never to `#content`,
 * because `mountContent()` replaces everything inside it on every navigation.
 */
export function bindTests(root) {
  const search = root.querySelector('#test-search');
  if (search) {
    search.addEventListener('input', () => {
      state.testQuery = search.value;
      paintTests();
    });
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      search.value = '';
      state.testQuery = '';
      paintTests();
    });
  }

  root.querySelector('#test-areas')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-test-cat]');
    if (!chip) return;
    state.testCategory = chip.dataset.testCat;
    root.querySelectorAll('[data-test-cat]').forEach((b) => b.classList.toggle('active', b === chip));
    paintTests();
  });

  // One delegated listener for both the list and the finding links inside the
  // detail: the detail is replaced on every selection, so per-item listeners
  // would be re-bound a few hundred times per page.
  root.addEventListener('click', (event) => {
    const item = event.target.closest('[data-test]');
    if (item) {
      state.testId = item.dataset.test;
      paintTests();
      document.getElementById('test-detail')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const find = event.target.closest('[data-find]');
    if (find) showFinding(find.dataset.find);
  });
}

export async function loadTests() {
  if (!state.tests) {
    const data = await api.tests();
    state.tests = data.guides || [];
  }
  // The findings are needed for the cross-links; fetching them with the guides
  // means a link is never a dead end after a cold load of this page.
  if (!state.findings) {
    try {
      const data = await api.findings();
      state.findings = data.findings || [];
    } catch {
      state.findings = [];
    }
  }
  paintTests();
}


/* ------------------------------------------------------------
   Findings
   ------------------------------------------------------------ */

function findingText(f) {
  return [f.area, f.severity, f.cwe, f.title, f.description, f.impact, ...(f.mitigation || [])]
    .join(' ')
    .toLowerCase();
}

function findingMatches(f) {
  if (state.findingCategory && f.category !== state.findingCategory) return false;
  if (state.findingSeverity && f.severity !== state.findingSeverity) return false;
  const q = lower(state.findingQuery).trim();
  if (!q) return true;
  return findingText(f).includes(q);
}

export function visibleFindings() {
  return (state.findings || []).filter(findingMatches);
}

function findingItemHTML(f) {
  const tone = SEVERITY_TONE[f.severity] || 'slate';
  return `<button class="lib-item find-item" type="button" data-find-row="${h(f.id)}">
      <span class="lib-sev" data-tone="${tone}">${h(f.severity)}</span>
      <span class="lib-item-body">
        <span class="lib-item-title">${h(f.title)}</span>
        <span class="lib-item-sub">${h(f.area)}${f.cwe ? ` · ${h(f.cwe)}` : ''}</span>
      </span>
    </button>`;
}

/** The open finding: the remembered one if it survived the filter, else the first. */
export function openFinding() {
  const rows = visibleFindings();
  return rows.find((f) => f.id === state.findingId) || rows[0] || null;
}

/** One finding, in full — the same shape as a guide, because it is read the same way. */
function findingDetailHTML(f) {
  if (!f) {
    return `<div class="lib-empty">
        <div class="lib-empty-title">No finding matches that search</div>
        <p>Try a stack ("sql"), an area ("access control") or clear the box.</p>
      </div>`;
  }
  const tone = SEVERITY_TONE[f.severity] || 'slate';
  return `<article class="guide find-detail" data-find-card="${h(f.id)}">
      <header class="guide-head">
        <div class="guide-meta">
          <span class="badge" data-tone="${tone}">${h(f.severity)}</span>
          <span class="find-area">${h(f.area)}</span>
          ${f.cwe ? `<span class="find-cwe">${h(f.cwe)}</span>` : ''}
        </div>
        <h2 class="guide-title">${h(f.title)}</h2>
      </header>

      <p class="guide-what">${h(f.description)}</p>

      <section class="guide-section">
        <h3 class="lib-h">Impact</h3>
        <p class="find-text">${h(f.impact)}</p>
      </section>

      <section class="guide-section">
        <h3 class="lib-h">Mitigation</h3>
        ${bulletList(f.mitigation, 'is-tight')}
      </section>

      ${
        f.guide
          ? `<button class="lib-link find-guide" type="button" data-test-jump="${h(f.guide)}">${icon.shield(13)} How to test this</button>`
          : ''
      }
    </article>`;
}

/**
 * The category chips: every project category, empty ones greyed out. Findings take
 * their category from the guide that proves them, so this list matches the project
 * list rather than inventing one.
 */
function findingCategoryChipsHTML() {
  return categoryChipsHTML(state.findings || [], 'category', 'data-find-cat', state.findingCategory || '');
}

function paintFindings() {
  const list = document.getElementById('find-list');
  const detail = document.getElementById('find-detail');
  const count = document.getElementById('find-count');
  const areas = document.getElementById('find-categories');
  if (!list || !detail || !count) return;
  if (areas) areas.innerHTML = findingCategoryChipsHTML();
  const rows = visibleFindings();
  const open = openFinding();
  if (open && state.findingId !== open.id) state.findingId = open.id;
  count.innerHTML = `<b>${rows.length}</b> of ${(state.findings || []).length} findings`;
  list.innerHTML = groupedHTML(rows, 'category', findingItemHTML);
  list.querySelectorAll('[data-find-row]').forEach((b) => {
    b.classList.toggle('is-open', b.dataset.findRow === state.findingId);
    b.setAttribute('aria-pressed', String(b.dataset.findRow === state.findingId));
  });
  detail.innerHTML = findingDetailHTML(open);
}

export function findingsPageHTML() {
  return `<div class="lib-page" data-lib="findings">
      <div class="lib-bar">
        <label class="lib-search">
          ${icon.search()}
          <input id="find-search" type="search" autocomplete="off" spellcheck="false"
                 placeholder="Search findings — a stack, an area, a word from the fix"
                 value="${h(state.findingQuery)}" aria-label="Search common findings">
        </label>
        <div class="chips" id="find-severities" role="group" aria-label="Filter by severity">
          ${['', ...SEVERITIES]
            .map(
              (s) =>
                `<button class="chip${(state.findingSeverity || '') === s ? ' active' : ''}" type="button" data-find-sev="${s}">${s || 'All'}</button>`
            )
            .join('')}
        </div>
        <div class="chips" id="find-categories" role="group" aria-label="Filter by category"></div>
      </div>
      <div class="lib-count" id="find-count"></div>
      <div class="lib-split">
        <div class="lib-list" id="find-list" aria-label="Findings"></div>
        <div class="lib-detail" id="find-detail"></div>
      </div>
    </div>`;
}

export function bindFindings(root) {
  const search = root.querySelector('#find-search');
  if (search) {
    search.addEventListener('input', () => {
      state.findingQuery = search.value;
      paintFindings();
    });
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      search.value = '';
      state.findingQuery = '';
      paintFindings();
    });
  }

  root.querySelector('#find-severities')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-find-sev]');
    if (!chip) return;
    state.findingSeverity = chip.dataset.findSev;
    root.querySelectorAll('[data-find-sev]').forEach((b) => b.classList.toggle('active', b === chip));
    paintFindings();
  });

  root.addEventListener('click', (event) => {
    const cat = event.target.closest('[data-find-cat]');
    if (cat) {
      state.findingCategory = cat.dataset.findCat;
      paintFindings();
      return;
    }
    const row = event.target.closest('[data-find-row]');
    if (row) {
      state.findingId = row.dataset.findRow;
      paintFindings();
      document.getElementById('find-detail')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const jump = event.target.closest('[data-test-jump]');
    if (jump) showGuide(jump.dataset.testJump);
  });
}

export async function loadFindings() {
  if (!state.findings) {
    const data = await api.findings();
    state.findings = data.findings || [];
  }
  paintFindings();
  focusFinding(state.findingFocus);
}


/* ------------------------------------------------------------
   Cross-links: the two libraries open each other
   ------------------------------------------------------------
   Both jump through the nav rather than scrolling, because the address bar has to
   agree with the screen: a "how to test this" that quietly swapped the page under
   /findings would make the URL a lie, and Back would go somewhere unexpected.
   ------------------------------------------------------------ */

/** Open one guide on the Tests page. */
export function showGuide(guideId) {
  if (!guideId) return;
  state.testId = guideId;
  // Clear a filter that would hide the guide we were asked to show.
  const guide = (state.tests || []).find((g) => g.id === guideId);
  if (guide) {
    if (state.testCategory && state.testCategory !== guide.category) state.testCategory = '';
    if (state.testQuery && !testMatches(guide)) state.testQuery = '';
  }
  handleNav('tests');
}

/** Open the Findings page scrolled to one finding. */
export function showFinding(findingId) {
  if (!findingId) return;
  const finding = (state.findings || []).find((f) => f.id === findingId);
  if (finding) {
    if (state.findingCategory && state.findingCategory !== finding.category) state.findingCategory = '';
    if (state.findingSeverity && state.findingSeverity !== finding.severity) state.findingSeverity = '';
    if (state.findingQuery && !findingMatches(finding)) state.findingQuery = '';
  }
  state.findingFocus = findingId;
  state.findingId = findingId;
  handleNav('findings');
}

/** Once the Findings page has painted, bring the focused row into view. */
export function focusFinding(id) {
  if (!id) return;
  const row = document.querySelector(`[data-find-row="${h(id)}"]`);
  state.findingFocus = '';
  if (!row) return;
  row.scrollIntoView({ block: 'center' });
  row.classList.add('is-focus');
  setTimeout(() => row.classList.remove('is-focus'), 1600);
}
