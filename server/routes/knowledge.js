import { db } from '../db.js';
import { COMMON_FINDINGS, GUIDE_CHECKLISTS, TEST_GUIDES } from '../knowledge.js';

/* ============================================================
   The reference libraries
   ------------------------------------------------------------
   Two reads, no writes. The content lives in `server/knowledge.js` because it is
   fixed reference text: a table would mean a schema bump to fix a sentence, and
   an editor nobody asked for. Both pages are readable by anyone signed in — the
   same rule as the user directory — so a new member can learn the method before
   they own an engagement.

   Deliberately no `?q=`: the whole library is a few dozen kilobytes, the client
   already holds it, and a search that round-trips would be slower and would put
   the filter in the URL where it belongs only if the URL were shareable.

   The guides themselves are code, but the checklist each one teaches is a row an
   admin owns. So every read joins the two: the guide prints the checklist's LIVE
   name and takes its category from that checklist's category. Rename
   "OWASP Top 10:2025" in the panel and the Tests page says the new name without a
   deploy; move its category to Mobile and the guides move with it. The string in
   `knowledge.js` is only the fallback for an install where the template was
   deleted, so a guide never renders without saying where it comes from.
   ============================================================ */

async function checklistFor() {
  const rows = await db.all('SELECT id, seed_key, name, category FROM checklists');
  const byKey = new Map(rows.map((r) => [r.seed_key, r]));
  const byName = new Map(rows.map((r) => [r.name, r]));
  return (guide) => byKey.get(GUIDE_CHECKLISTS[guide.checklist]) || byName.get(guide.checklist) || null;
}

async function guidesWithChecklist() {
  const find = await checklistFor();
  const asked = await askedWhere();
  return TEST_GUIDES.map((guide) => {
    const list = find(guide);
    return {
      ...guide,
      checklistId: list?.id ?? null,
      checklistName: list?.name || guide.checklist,
      // The checklist owns the category; `area` is what the text was written for
      // and stays on the guide as the fallback when the template is gone.
      category: list?.category || guide.area,
      // Where a pentester will actually meet this guide: one entry per checklist
      // holding rows linked to it. Derived from the items, never stored on the
      // guide — an admin adding a row makes the guide findable the same day.
      asked: asked.get(guide.id) || [],
    };
  });
}

/** guide id → the checklists whose items point at it, with how many rows each has. */
async function askedWhere() {
  const rows = await db.all(
    `SELECT i.guide_key, c.id AS checklist_id, c.name AS checklist_name
       FROM checklist_items i
       JOIN checklists c ON c.id = i.checklist_id
      WHERE i.guide_key <> ''`
  );
  const map = new Map();
  for (const row of rows) {
    const perGuide = map.get(row.guide_key) || [];
    const known = perGuide.find((a) => a.checklistId === Number(row.checklist_id));
    if (known) known.items += 1;
    else
      perGuide.push({
        checklistId: Number(row.checklist_id),
        checklistName: row.checklist_name,
        items: 1,
      });
    map.set(row.guide_key, perGuide);
  }
  return map;
}

export const routes = {
  'GET /api/tests': async () => ({ guides: await guidesWithChecklist() }),

  // A finding has no category of its own: it belongs to the category of the test
  // that proves it, which is the checklist's category, which is the project's.
  // One chain, no second vocabulary to keep in step by hand.
  'GET /api/findings': async () => {
    const category = new Map((await guidesWithChecklist()).map((g) => [g.id, g.category]));
    return { findings: COMMON_FINDINGS.map((f) => ({ ...f, category: category.get(f.guide) || '' })) };
  },
};
