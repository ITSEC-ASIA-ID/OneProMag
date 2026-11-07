/**
 * Findings recorded on ONE engagement.
 *
 * This is not the reference library (`routes/knowledge.js`) and must not become
 * it. The library is our method — fixed text, one row per risk, edited by us.
 * A row here is a claim we make to a client about this project: "we found this,
 * it is this bad, here is what to do". It can start from a library entry
 * (`template` names the one it was written from) and is then edited freely,
 * because what we found is never exactly what the template describes.
 *
 * Kept apart from `retests.findings` on purpose: that column is the client's
 * re-test narrative, a paragraph on a request. This is the deliverable list.
 */
import { db } from '../db.js';
import { HttpError, nowISO } from '../auth.js';
import { levelOf, riskMatrix, severityFor } from '../risk.js';
import { assertProject, requireDeleter } from '../shared.js';

export const FINDING_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

/** Open → Fixed → Accepted. Enough to answer "what is still on the table?". */
export const FINDING_STATUSES = ['Open', 'Fixed', 'Accepted'];

const MAX_TEXT = 20000;
const MAX_TITLE = 300;

/** Trimmed and length-checked; empty is allowed (a field can be cleared). */
function textValue(value, label, max = MAX_TEXT) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new HttpError(400, `${label} is limited to ${max} characters`);
  return text;
}

/**
 * Likelihood and impact, both required together.
 *
 * Severity is never accepted from the client: it is the matrix's answer, and a
 * caller that could send it would be able to file a 5 × 5 as Low.
 */
function ratingsOf(body, fallback = { likelihood: 0, impactScore: 0 }) {
  const likelihood = body.likelihood === undefined ? fallback.likelihood : levelOf(body.likelihood);
  const impactScore = body.impactScore === undefined ? fallback.impactScore : levelOf(body.impactScore);
  if (!likelihood || !impactScore) {
    throw new HttpError(400, 'Assess both likelihood and impact, each from 1 to 5');
  }
  return { likelihood, impactScore, severity: severityFor(likelihood, impactScore) };
}

function statusOf(value, fallback) {
  if (value === undefined) return fallback;
  const wanted = String(value).trim();
  if (!FINDING_STATUSES.includes(wanted)) {
    throw new HttpError(400, `A finding status is one of ${FINDING_STATUSES.join(', ')}`);
  }
  return wanted;
}

function shape(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    title: row.title,
    // Severity is what the matrix says today, not what a column happened to say
    // when the row was written: re-banding the matrix must re-band the list.
    severity: row.likelihood && row.impact_score
      ? severityFor(row.likelihood, row.impact_score)
      : row.severity,
    likelihood: Number(row.likelihood) || 0,
    impactScore: Number(row.impact_score) || 0,
    score: (Number(row.likelihood) || 0) * (Number(row.impact_score) || 0),
    status: row.status,
    // The library entry this was written from, '' when it was written from
    // nothing. It is a citation, not a live link: editing the library later
    // must not rewrite what we told a client last month.
    template: row.template || '',
    description: row.description || '',
    impact: row.impact || '',
    mitigation: row.mitigation || '',
    createdBy: row.created_by ? Number(row.created_by) : null,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

// Worst first: the tab is read as a list of what matters most.
const ORDER = `CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, id DESC`;

async function findingRow(id) {
  const row = await db.get(
    `SELECT f.*, u.name AS created_by_name
       FROM project_findings f
       LEFT JOIN users u ON u.id = f.created_by
      WHERE f.id = ?`,
    [id]
  );
  if (!row) throw new HttpError(404, 'Finding not found');
  return row;
}

/** The project's stamp moves when its findings do, and only then. */
async function touchProject(projectId, stamp) {
  await db.run('UPDATE projects SET updated_at = ? WHERE id = ?', [stamp, projectId]);
}

export const routes = {
  /**
   * GET /api/risk-matrix — the 5×5 table, levels and band thresholds.
   *
   * Served rather than hard-coded in the client so the form cannot band a 4 × 4
   * differently from the server that stored it, and so re-banding the matrix is
   * one edit rather than two that must agree.
   */
  'GET /api/risk-matrix': async () => riskMatrix(),

  'GET /api/projects/:id/findings': async (ctx) => {
    const project = await assertProject(ctx.params.id);
    const rows = await db.all(
      `SELECT f.*, u.name AS created_by_name
         FROM project_findings f
         LEFT JOIN users u ON u.id = f.created_by
        WHERE f.project_id = ?
        ORDER BY ${ORDER}`,
      [project.id]
    );
    return { findings: rows.map(shape) };
  },

  'POST /api/projects/:id/findings': async (ctx) => {
    const project = await assertProject(ctx.params.id);
    const body = ctx.body || {};
    const title = textValue(body.title, 'A title', MAX_TITLE);
    if (!title) throw new HttpError(400, 'A finding needs a title');
    const ratings = ratingsOf(body);
    const ts = nowISO();
    const inserted = await db.run(
      `INSERT INTO project_findings (project_id, title, severity, likelihood, impact_score, status, template, description, impact, mitigation, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        project.id,
        title,
        ratings.severity,
        ratings.likelihood,
        ratings.impactScore,
        statusOf(body.status, 'Open'),
        textValue(body.template, 'A template', 120),
        textValue(body.description, 'A description'),
        textValue(body.impact, 'An impact'),
        textValue(body.mitigation, 'A mitigation'),
        ctx.user?.id ?? null,
        ts,
        ts,
      ]
    );
    await touchProject(project.id, ts);
    return { finding: shape(await findingRow(Number(inserted.lastInsertId ?? inserted.id))) };
  },

  'PATCH /api/findings/:id': async (ctx) => {
    const row = await findingRow(ctx.params.id);
    const body = ctx.body || {};
    // A row filed before the matrix has 0/0; editing it must supply both ratings,
    // which is the moment the tester is asked for them.
    const ratings = ratingsOf(body, { likelihood: Number(row.likelihood) || 0, impactScore: Number(row.impact_score) || 0 });
    const next = {
      title: body.title === undefined ? row.title : textValue(body.title, 'A title', MAX_TITLE) || row.title,
      severity: ratings.severity,
      likelihood: ratings.likelihood,
      impact_score: ratings.impactScore,
      status: statusOf(body.status, row.status),
      template: body.template === undefined ? row.template : textValue(body.template, 'A template', 120),
      description: body.description === undefined ? row.description : textValue(body.description, 'A description'),
      impact: body.impact === undefined ? row.impact : textValue(body.impact, 'An impact'),
      mitigation: body.mitigation === undefined ? row.mitigation : textValue(body.mitigation, 'A mitigation'),
    };
    const changed = Object.entries(next).some(([key, value]) => String(row[key] ?? '') !== String(value ?? ''));
    // A save that changed nothing is not an edit: it must not reshuffle the list
    // this project sits in by moving its stamp.
    if (!changed) return { finding: shape(row) };

    const stamp = nowISO();
    await db.run(
      `UPDATE project_findings
          SET title = ?, severity = ?, likelihood = ?, impact_score = ?, status = ?, template = ?, description = ?, impact = ?, mitigation = ?, updated_at = ?
        WHERE id = ?`,
      [
        next.title,
        next.severity,
        next.likelihood,
        next.impact_score,
        next.status,
        next.template,
        next.description,
        next.impact,
        next.mitigation,
        stamp,
        row.id,
      ]
    );
    await touchProject(row.project_id, stamp);
    return { finding: shape(await findingRow(row.id)) };
  },

  'DELETE /api/findings/:id': async (ctx) => {
    requireDeleter(ctx, 'a finding');
    const row = await findingRow(ctx.params.id);
    await db.run('DELETE FROM project_findings WHERE id = ?', [row.id]);
    await touchProject(row.project_id, nowISO());
    return { ok: true, title: row.title };
  },
};
