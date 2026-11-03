import { api } from './api.js';
import { icon } from './icons.js';
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


/* ------------------------------------------------------------
   Tests
   ------------------------------------------------------------ */

/** Every string in a guide, so search does not stop at the title. */
function guideText(g) {
  return [g.code, g.area, g.title, g.checklist, g.what, g.tools?.join(' '), ...(g.steps || []), ...(g.passes || []), ...(g.watch || [])]
    .join(' ')
    .toLowerCase();
}

function testMatches(g) {
  if (state.testArea && g.area !== state.testArea) return false;
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
        <span class="lib-item-sub">${h(g.area)} · ${h(g.code.split(':')[1] || '')}</span>
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
          <span class="badge" data-tone="slate">${h(g.area)}</span>
          <span class="guide-from">${icon.shield(13)} ${h(g.checklist)}</span>
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

      ${guideFindingsHTML(g.id)}
    </article>`;
}

/** The list, the count and the open guide — everything but the shell. */
function paintTests() {
  const list = document.getElementById('test-list');
  const detail = document.getElementById('test-detail');
  const count = document.getElementById('test-count');
  if (!list || !detail || !count) return;

  const rows = visibleGuides();
  const open = openGuide();
  if (open && state.testId !== open.id) state.testId = open.id;

  count.innerHTML = `<b>${rows.length}</b> of ${(state.tests || []).length} guides`;
  list.innerHTML = rows.length
    ? rows.map(guideItemHTML).join('')
    : `<div class="lib-none">Nothing matches.</div>`;
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
        <div class="chips" id="test-areas" role="group" aria-label="Filter by area">
          ${['', 'Web', 'API']
            .map(
              (a) =>
                `<button class="chip${(state.testArea || '') === a ? ' active' : ''}" type="button" data-test-area="${a}">${a || 'All'}</button>`
            )
            .join('')}
        </div>
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
    const chip = event.target.closest('[data-test-area]');
    if (!chip) return;
    state.testArea = chip.dataset.testArea;
    root.querySelectorAll('[data-test-area]').forEach((b) => b.classList.toggle('active', b === chip));
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
  if (state.findingSeverity && f.severity !== state.findingSeverity) return false;
  const q = lower(state.findingQuery).trim();
  if (!q) return true;
  return findingText(f).includes(q);
}

export function visibleFindings() {
  return (state.findings || []).filter(findingMatches);
}

function findingCardHTML(f) {
  const tone = SEVERITY_TONE[f.severity] || 'slate';
  return `<article class="find-card" data-find-card="${h(f.id)}">
      <div class="find-top">
        <span class="badge" data-tone="${tone}">${h(f.severity)}</span>
        <span class="find-area">${h(f.area)}</span>
        ${f.cwe ? `<span class="find-cwe">${h(f.cwe)}</span>` : ''}
      </div>
      <h3 class="find-title">${h(f.title)}</h3>
      <p class="find-desc">${h(f.description)}</p>
      <div class="find-block">
        <div class="find-label">Impact</div>
        <p class="find-text">${h(f.impact)}</p>
      </div>
      <div class="find-block">
        <div class="find-label">Mitigation</div>
        ${bulletList(f.mitigation, 'is-tight')}
      </div>
      ${
        f.guide
          ? `<button class="lib-link find-guide" type="button" data-test-jump="${h(f.guide)}">${icon.shield(13)} How to test this</button>`
          : ''
      }
    </article>`;
}

function paintFindings() {
  const list = document.getElementById('find-list');
  const count = document.getElementById('find-count');
  if (!list || !count) return;
  const rows = visibleFindings();
  count.innerHTML = `<b>${rows.length}</b> of ${(state.findings || []).length} findings`;
  list.innerHTML = rows.length
    ? rows.map(findingCardHTML).join('')
    : `<div class="lib-empty">
         <div class="lib-empty-title">No finding matches that search</div>
         <p>Try a stack ("sql"), an area ("access control") or clear the box.</p>
       </div>`;
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
      </div>
      <div class="lib-count" id="find-count"></div>
      <div class="find-grid" id="find-list"></div>
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
    if (state.testArea && state.testArea !== guide.area) state.testArea = '';
    if (state.testQuery && !testMatches(guide)) state.testQuery = '';
  }
  handleNav('tests');
}

/** Open the Findings page scrolled to one finding. */
export function showFinding(findingId) {
  if (!findingId) return;
  const finding = (state.findings || []).find((f) => f.id === findingId);
  if (finding) {
    if (state.findingSeverity && state.findingSeverity !== finding.severity) state.findingSeverity = '';
    if (state.findingQuery && !findingMatches(finding)) state.findingQuery = '';
  }
  state.findingFocus = findingId;
  handleNav('findings');
}

/** Once the Findings page has painted, bring the focused card into view. */
export function focusFinding(id) {
  if (!id) return;
  const card = document.querySelector(`[data-find-card="${h(id)}"]`);
  state.findingFocus = '';
  if (!card) return;
  card.scrollIntoView({ block: 'center' });
  card.classList.add('is-focus');
  setTimeout(() => card.classList.remove('is-focus'), 1600);
}
