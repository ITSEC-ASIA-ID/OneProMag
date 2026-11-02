import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';
import { HttpError, nowISO } from '../auth.js';
import { assertProject, requireDeleter, HANDLED } from '../shared.js';

/* Attachments: one project, many files.
 *
 * The bytes live on disk under UPLOAD_DIR/<projectId>/<uuid> and the row in
 * project_files is the index. The database was the tempting place for them
 * (pg_dump then carries the files for free) but a 200 MB library of reports
 * would make every nightly dump 200 MB, kept fourteen days, and a 15 MB insert
 * would hold the SQLite write lock for its whole duration. The cost is that a
 * backup has two artefacts instead of one — see deploy/backup.sh, which archives
 * this directory beside the dump. */

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** base64 inflates by 4/3; +64 KB of slack covers the rest of the envelope. */
export const UPLOAD_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 64 * 1024;

/** Refused before the transfer starts, so the message is about the file. */
const SIZE_MESSAGE = `Files are limited to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;

function shapeFile(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    name: row.name,
    mime: row.mime || '',
    size: Number(row.size || 0),
    uploadedBy: row.uploaded_by ? Number(row.uploaded_by) : null,
    uploadedByName: row.uploaded_by_name || '',
    createdAt: row.created_at,
  };
}

/**
 * The stored name is generated, never taken from the upload: a client-controlled
 * filename is a path traversal, a double extension and a 255-byte problem at once.
 * The display name is still theirs, so it is stripped of separators and control
 * characters and cut to a length every filesystem and every UI can show.
 */
function displayName(raw) {
  const name = String(raw || '')
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .trim()
    .slice(0, 180);
  return name || 'file';
}

function safeMime(raw) {
  const mime = String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120);
  return mime || 'application/octet-stream';
}

function projectDir(projectId) {
  return path.join(UPLOAD_DIR, String(projectId));
}

async function fileRow(id) {
  const row = await db.get(
    `SELECT f.*, u.name AS uploaded_by_name
       FROM project_files f
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.id = ?`,
    [id]
  );
  if (!row) throw new HttpError(404, 'File not found');
  return row;
}

async function unlinkQuiet(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    // Already gone is the state we wanted; anything else is worth a line in the
    // log but must not fail the request that removed the row.
    if (err.code !== 'ENOENT') console.error('[files] could not remove', filePath, err.message);
  }
}

/**
 * Removes every stored byte for a project. Called by DELETE /api/projects/:id
 * BEFORE the row cascade? No — the rows cascade with the project, so the names
 * have to be read first: by the time the delete returns, the index is gone and
 * the files are unreachable forever. See purgeProjectFiles().
 */
async function removeStored(projectId, storedNames) {
  const dir = projectDir(projectId);
  for (const name of storedNames) await unlinkQuiet(path.join(dir, name));
  try {
    await fsp.rmdir(dir);
  } catch {
    // Not empty (a concurrent upload) or already gone. Neither is an error.
  }
}

/**
 * Deletes a project's files, and must be called while the rows still exist.
 * Returns the count so the caller can say what it destroyed.
 */
export async function purgeProjectFiles(projectId) {
  const rows = await db.all('SELECT stored_name FROM project_files WHERE project_id = ?', [projectId]);
  await removeStored(projectId, rows.map((r) => r.stored_name));
  return rows.length;
}

export const routes = {
  'GET /api/projects/:id/files': async (ctx) => {
    await assertProject(ctx.params.id);
    const rows = await db.all(
      `SELECT f.*, u.name AS uploaded_by_name
         FROM project_files f
         LEFT JOIN users u ON u.id = f.uploaded_by
        WHERE f.project_id = ?
        ORDER BY f.created_at DESC, f.id DESC`,
      [ctx.params.id]
    );
    return { files: rows.map(shapeFile) };
  },

  'POST /api/projects/:id/files': async (ctx) => {
    const project = await assertProject(ctx.params.id);
    const body = ctx.body || {};
    const data = typeof body.data === 'string' ? body.data.trim() : '';
    if (!data) throw new HttpError(400, 'No file contents were sent');
    if (!/^[A-Za-z0-9+/\s]*={0,2}$/.test(data)) throw new HttpError(400, 'File contents are not valid base64');

    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) throw new HttpError(400, 'The file is empty');
    if (bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(413, SIZE_MESSAGE);

    const row = {
      project_id: Number(project.id),
      name: displayName(body.name),
      mime: safeMime(body.mime),
      size: bytes.length,
      stored_name: crypto.randomUUID(),
      uploaded_by: ctx.user.id,
      created_at: nowISO(),
    };

    const dir = projectDir(row.project_id);
    await fsp.mkdir(dir, { recursive: true });
    const target = path.join(dir, row.stored_name);
    await fsp.writeFile(target, bytes);
    try {
      const info = await db.run(
        `INSERT INTO project_files (project_id, name, mime, size, stored_name, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [row.project_id, row.name, row.mime, row.size, row.stored_name, row.uploaded_by, row.created_at]
      );
      const created = await fileRow(info.lastInsertId);
      return { file: shapeFile(created) };
    } catch (err) {
      // The bytes were written but the index refused them: remove them now, or
      // they become garbage only a `find` will ever reveal.
      await unlinkQuiet(target);
      throw err;
    }
  },

  'GET /api/project-files/:id/download': async (ctx) => {
    const row = await fileRow(ctx.params.id);
    const filePath = path.join(projectDir(row.project_id), row.stored_name);
    let stat = null;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      throw new HttpError(410, 'The stored file is missing — re-upload it');
    }

    const fallback = row.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    ctx.res.writeHead(200, {
      // Always a download, never the stored mime: a client-uploaded .html or .svg
      // served inline from this origin is stored XSS with extra steps, and the CSP
      // does not stop a same-origin document from running.
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      'Content-Length': stat.size,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(fs.createReadStream(filePath), ctx.res);
    return HANDLED;
  },

  'DELETE /api/project-files/:id': async (ctx) => {
    requireDeleter(ctx, 'a file');
    const row = await fileRow(ctx.params.id);
    // Row first, bytes second: a row without bytes is a broken download (visible,
    // fixable), bytes without a row are invisible garbage.
    await db.run('DELETE FROM project_files WHERE id = ?', [row.id]);
    await removeStored(row.project_id, [row.stored_name]);
    return { ok: true, name: row.name };
  },
};
