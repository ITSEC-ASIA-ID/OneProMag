import { db, canManageCatalog } from './db.js';
import { HttpError, nowISO } from './auth.js';

/* Cross-cutting helpers: row shaping, ownership guards and the property
   reads that most writes depend on. Anything used by a single route file
   lives in that file instead. */

let propertyCache = null;

/** Dropped by whatever changed the catalogue, so the next read rebuilds it. */
export function clearPropertyCache() {
  propertyCache = null;
}


export function shapeProperty(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    key: row.key,
    label: row.label,
    tone: row.tone || 'slate',
    position: Number(row.position || 0),
    locked: Boolean(Number(row.locked)),
  };
}


/** All properties, grouped by kind. Cached until a writer clears it. */
export async function properties() {
  if (propertyCache) return propertyCache;
  const rows = await db.all(
    'SELECT id, kind, key, label, tone, position, locked FROM properties ORDER BY kind, position, id'
  );
  const grouped = { category: [], status: [] };
  for (const row of rows) {
    const shaped = shapeProperty(row);
    if (grouped[shaped.kind]) grouped[shaped.kind].push(shaped);
  }
  propertyCache = grouped;
  return grouped;
}


/** The stored keys for one kind, in display order. */
export async function propertyKeys(kind) {
  return (await properties())[kind].map((p) => p.key);
}


/**
 * Project list/detail select.
 *
 * The correlated subqueries for retest counts work verbatim on SQLite and
 * PostgreSQL. Pentesters are NOT joined here: GROUP_CONCAT (SQLite) and
 * string_agg (Postgres) differ, and building a '|||' delimited string then
 * splitting it in JS is fragile. They are fetched in one follow-up query and
 * grouped in memory instead — see attachPentesters().
 */
export const projectSelect = `
  SELECT p.*,
         c.short_name AS client_short,
         a.name AS application_name,
         v.name AS variant_name,
         m.name AS supervisor_name,
         m.email AS supervisor_email,
         m.phone AS supervisor_phone,
         (SELECT COUNT(*) FROM retests r WHERE r.project_id = p.id) AS retest_count,
         (SELECT COUNT(*) FROM retests r WHERE r.project_id = p.id AND ${retestOpen('r')}) AS open_retest_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN applications a ON a.id = p.application_id
    LEFT JOIN application_variants v ON v.id = p.variant_id
    LEFT JOIN users m ON m.id = p.supervisor_id
`;


/**
 * The one rule for "did somebody actually edit this?".
 *
 * `next` must be keyed by the database column names of exactly the columns the
 * UPDATE writes. The stamp that comes back is a fresh one when something really
 * differs, and the row's existing one when the save was a no-op.
 *
 * A no-op is not hypothetical: every client posts the whole form, so "open the
 * record, change nothing, press Save" is indistinguishable at the request level.
 * Stamping it anyway moved the row to the top of its status block — the project
 * list orders by `updated_at` — and made the drawer footer claim an edit that
 * never happened. Pinning a note is the same class of non-edit.
 *
 * Comparing the written field list rather than the whole row is deliberate: the
 * row contains `updated_at` itself, so a whole-row comparison always differs.
 */
export function editStamp(row, next) {
  for (const [column, value] of Object.entries(next)) {
    if (String(row[column] ?? '') !== String(value ?? '')) return nowISO();
  }
  return row.updated_at;
}


/**
 * Who may supervise an engagement.
 *
 * A supervisor is either a dedicated Supervisor account (someone whose job is
 * supervising) or a pentester who runs the work in the field — or nobody at all,
 * because an engagement can be filed before anyone is assigned to it. Admins are
 * operations, not supervisors, so they are not in this pool.
 */
// Who may be named as a project's supervisor (SV): a Project Manager account, or a
// pentester. Admin accounts run the tool, they do not own engagements.
export const SUPERVISOR_ROLES = ['Project Manager', 'Pentester'];

export const canSupervise = (row) => Boolean(row) && SUPERVISOR_ROLES.includes(row.role);


export async function getProjectRaw(id) {
  return db.get(`${projectSelect} WHERE p.id = ?`, [id]);
}


export async function assertProject(id) {
  const row = await getProjectRaw(id);
  if (!row) throw new HttpError(404, 'Project not found');
  return row;
}


/**
 * What counts as an OPEN retest — the predicate behind the Active lists, the retest
 * queue card, the board chips and the "in use" check when deleting a status.
 *
 * "Not Done" rather than a list of the three statuses that happened to be in use
 * when this was written: a retest on `Hold` is paused work, not history, and it was
 * invisible everywhere because only `Incoming`/`Ongoing` matched. Anything an admin
 * adds as a status (a custom `Blocked`, say) is open by the same rule, and `Done` is
 * the one status the workflow locks, so this cannot be emptied from the UI.
 */
export function retestOpen(alias = '') {
  return `${alias ? `${alias}.` : ''}status <> 'Done'`;
}


export function requireCatalogManager(ctx) {
  if (!canManageCatalog(ctx.user)) {
    throw new HttpError(403, 'Only admin, lead or sub lead can open the admin panel');
  }
}


/**
 * Deleting is the one thing a plain pentester cannot do.
 *
 * Creating and editing stay open to everyone signed in — a tester files the
 * retest request, moves the engagement to Ready, writes the device inventory,
 * and that is the job. Deleting is not part of that job and it is not
 * reversible: `DELETE FROM projects` cascades to the retests and the team
 * assignment, and the notes behind it, with no soft delete and no undo. So the
 * confirmation dialog is not the only thing standing between a misclick and a
 * lost engagement.
 *
 * `label` names the record in the message ("a project"), because "Not allowed"
 * tells the person nothing about what they tried to remove.
 */
export function requireDeleter(ctx, label) {
  if (!canManageCatalog(ctx.user)) {
    throw new HttpError(403, `Only admin, lead or sub lead can delete ${label}`);
  }
}
