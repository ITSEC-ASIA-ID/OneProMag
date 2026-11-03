import { COMMON_FINDINGS, TEST_GUIDES } from '../knowledge.js';

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
   ============================================================ */

/**
 * A finding has no category of its own: it belongs to the category of the test that
 * proves it, which is the category the engagement is filed under. Deriving it here
 * keeps `knowledge.js` free of a field that would have to be kept in sync by hand —
 * change a guide's area and its findings move with it.
 */
const guideArea = new Map(TEST_GUIDES.map((g) => [g.id, g.area]));
const FINDINGS = COMMON_FINDINGS.map((f) => ({ ...f, category: guideArea.get(f.guide) || '' }));

export const routes = {
  'GET /api/tests': async () => ({ guides: TEST_GUIDES }),
  'GET /api/findings': async () => ({ findings: FINDINGS }),
};
