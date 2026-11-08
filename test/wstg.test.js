import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WSTG_BASE,
  WSTG_CASES,
  WSTG_CATEGORIES,
  isWstgCode,
  wstgCategoryCode,
  wstgTitle,
  wstgUrl,
} from '../server/wstg.js';
import { TEST_GUIDES, guideKeyFor } from '../server/knowledge.js';

test('the WSTG is twelve categories and the test cases they publish', () => {
  // The count is the contract: the checklist shipped from this list says "116 test
  // cases", and a silent drop to 115 would still render.
  assert.equal(WSTG_CATEGORIES.length, 12);
  assert.equal(WSTG_CASES.length, 116);
  assert.equal(new Set(WSTG_CASES.map((c) => c.code)).size, 116, 'two test cases share a code');
  assert.deepEqual(
    WSTG_CATEGORIES.map((c) => c.key),
    ['INFO', 'CONF', 'IDNT', 'ATHN', 'ATHZ', 'SESS', 'INPV', 'ERRH', 'CRYP', 'BUSL', 'CLNT', 'APIT']
  );
});

test('every case is named the way a report cites it', () => {
  for (const one of WSTG_CASES) {
    assert.match(one.code, /^WSTG-[A-Z]{4}-\d{2}$/, one.code);
    assert.ok(one.title.trim().length > 3, `${one.code} has no title`);
    assert.ok(one.url.startsWith(`${WSTG_BASE}/`), `${one.code} has no page on wstg.owasp.org`);
    const category = WSTG_CATEGORIES.find((c) => c.code === one.category);
    assert.ok(category, `${one.code} belongs to no category`);
    assert.ok(one.url.includes(`/${category.dir}/`), `${one.code} points outside its category`);
  }
});

test('a category and a case both resolve to the page that publishes them', () => {
  assert.equal(wstgUrl('WSTG-ATHZ'), `${WSTG_BASE}/05-Authorization/`);
  assert.equal(wstgUrl('WSTG-ATHZ-04'), `${WSTG_BASE}/05-Authorization/04-Insecure_Direct_Object_References/`);
  assert.equal(wstgTitle('WSTG-ATHZ-04'), 'Authorization');
  assert.equal(wstgCategoryCode('WSTG-ERRH-01'), 'WSTG-ERRH');
  assert.equal(wstgUrl('WSTG-NOPE'), '', 'an unknown category must not build a URL');
});

test('a citation is one of the twelve categories, or nothing', () => {
  for (const good of ['WSTG-INFO', 'WSTG-APIT', 'WSTG-BUSL', 'WSTG-ATHZ-04']) {
    assert.ok(isWstgCode(good), `${good} should be accepted`);
  }
  for (const bad of ['', 'ATHZ', 'WSTG-', 'WSTG-XXXX', 'wstg-athz', 'WSTG-ATHZ-4', null, undefined]) {
    assert.equal(isWstgCode(bad), false, `${JSON.stringify(bad)} should be refused`);
  }
});

test('every guide cites a category the guide actually publishes', () => {
  const codes = new Set(WSTG_CATEGORIES.map((c) => c.code));
  for (const guide of TEST_GUIDES) {
    assert.ok(codes.has(guide.wstg), `${guide.id} cites ${guide.wstg}, which is not a WSTG category`);
  }
  // Not every category has a guide: the library is written around risk categories,
  // and this method has phases (information gathering, sessions, client-side) that
  // no Top-10 entry names. The list is here so a missing one is a decision, not a
  // surprise — the WSTG row still links to wstg.owasp.org.
  const uncovered = WSTG_CATEGORIES.map((c) => c.code).filter((code) => !TEST_GUIDES.some((g) => g.wstg === code));
  assert.deepEqual(uncovered, ['WSTG-INFO', 'WSTG-IDNT', 'WSTG-SESS', 'WSTG-CLNT']);
});

test('a WSTG checklist row finds the guide that claimed its category', () => {
  // The section is a category, not a Top-10 code, so the link ignores the
  // checklist it sits in — the WSTG template is its own standard.
  assert.equal(guideKeyFor('owasp-wstg', 'WSTG-ATHZ — Authorization'), 'A01');
  assert.equal(guideKeyFor('owasp-wstg', 'WSTG-INPV — Injection'), 'A05');
  assert.equal(guideKeyFor('owasp-wstg', 'WSTG-SESS — Session Management'), '', 'a phase no guide covers links to nothing');
  // A Top-10 row still resolves through the checklist, exactly as before.
  assert.equal(guideKeyFor('owasp-web', 'A05:2025 — Injection'), 'A05');
  assert.equal(guideKeyFor('owasp-api', 'API1:2023 — Broken Object Level Authorization'), 'API1');
});
