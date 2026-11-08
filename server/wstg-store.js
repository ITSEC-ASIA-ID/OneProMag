import { db } from './db.js';

/*
   The WSTG, read from the database.

   It used to be a module. The moment an admin could edit a guide, keeping the
   method in code meant two vocabularies that could disagree — so the twelve
   categories and their cases are rows (`wstg_categories`, `wstg_cases`), seeded
   once from `server/knowledge.js` and edited in the Admin panel afterwards.

   Three things are derived here and never stored:
     · a case's category title, read through its category;
     · a case's URL, from the category directory and the case slug — the site
       spells two slugs against their titles, so the slug is a column, not a guess;
     · whether an id is real, which is the same question as "is it a row".

   The index is cached because every checklist row asks for it; every write in the
   admin panel calls `forgetWstg()` so the next read is the truth.
*/

export const WSTG_BASE =
  'https://wstg.owasp.org/latest/4-Web_Application_Security_Testing';

let cached = null;

export function forgetWstg() {
  cached = null;
}

/** Categories and cases, with each case joined to its category and its URL. */
export async function wstgIndex(force = false) {
  if (cached && !force) return cached;

  const [categories, rows] = await Promise.all([
    db.all(
      'SELECT code, title, dir, position FROM wstg_categories ORDER BY position, code'
    ),
    db.all(
      'SELECT code, category_code, title, slug, position FROM wstg_cases ORDER BY position, code'
    ),
  ]);

  const byCategory = new Map(categories.map((one) => [one.code, one]));
  const byCase = new Map();
  for (const row of rows) {
    const category = byCategory.get(row.category_code);
    if (!category) continue; // a case with no category is not reachable
    byCase.set(row.code, {
      code: row.code,
      title: row.title,
      slug: row.slug,
      position: row.position,
      category: category.code,
      categoryTitle: category.title,
      url: `${WSTG_BASE}/${category.dir}/${row.slug}/`,
    });
  }

  cached = { categories, cases: [...byCase.values()], byCategory, byCase };
  return cached;
}

/** Category of a category or case code — `''` for anything the tables do not know. */
export function categoryOf(index, value) {
  const code = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!code) return '';
  if (index.byCategory.has(code)) return code;
  return index.byCase.get(code)?.category || '';
}

/** Title and page for a category or case code; both empty when it is not real. */
export function wstgUrlOf(index, value) {
  const code = String(value ?? '')
    .trim()
    .toUpperCase();
  if (index.byCategory.has(code)) {
    const category = index.byCategory.get(code);
    return { title: category.title, url: `${WSTG_BASE}/${category.dir}/` };
  }
  const one = index.byCase.get(code);
  return one ? { title: one.title, url: one.url } : { title: '', url: '' };
}

/**
 * Which guide answers a category: the first in library order that claims it.
 * A category no guide claims is not an error — it is a gap in the library, and
 * the checklist row simply has no guide to open.
 */
export async function wstgClaims() {
  const rows = await db.all(
    "SELECT wstg, id FROM test_guides WHERE wstg <> '' ORDER BY position, id"
  );
  const claims = new Map();
  for (const row of rows) {
    if (!claims.has(row.wstg)) claims.set(row.wstg, row.id);
  }
  return claims;
}

/** The WSTG checklist template's rows, built from the tables so an edit reaches it. */
export async function wstgChecklistItems() {
  const index = await wstgIndex();
  return index.cases.map((one) => [
    `${one.category} — ${one.categoryTitle}`,
    `${one.code} ${one.title}`,
    '',
  ]);
}
