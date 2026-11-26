import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';
import { HttpError, nowISO } from '../auth.js';
import { assertProject, requireDeleter, HANDLED } from '../shared.js';
import { assertInfoScope, assertScopeExists } from './info.js';

/* Attachments: one project, many files.
 *
 * The bytes live on disk under UPLOAD_DIR/<projectId>/<uuid> and the row in
 * project_files is the index. The database was the tempting place for them
 * (pg_dump then carries the files for free) but a 200 MB library of reports
 * would make every nightly dump 200 MB, kept fourteen days, and a 15 MB insert
 * would hold the SQLite write lock for its whole duration. The cost is that a
 * backup has two artefacts instead of one — see deploy/backup.sh, which archives
 * this directory beside the dump. */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * An information-center file is an input to the engagement, not its paperwork:
 * a packet capture, a scan export, a vendor questionnaire dump. Those are an
 * order of magnitude bigger than a scope PDF, so they get their own ceiling
 * instead of raising everyone's.
 */
export const MAX_INFO_BYTES = 50 * 1024 * 1024;

/** base64 inflates by 4/3; +64 KB of slack covers the rest of the envelope. */
export const UPLOAD_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 64 * 1024;
export const INFO_BODY_LIMIT = Math.ceil((MAX_INFO_BYTES * 4) / 3) + 64 * 1024;

/** Refused before the transfer starts, so the message is about the file. */
const SIZE_MESSAGE = `Files are limited to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;
const INFO_SIZE_MESSAGE = `Files are limited to ${MAX_INFO_BYTES / (1024 * 1024)} MB`;

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


/* ------------------------------------------------------------
   Information-center files
   ------------------------------------------------------------
   The same rules as a project's attachments — a generated stored name, the bytes
   on disk, the row as the index — keyed by (scope, scope_id) instead of a
   project, because what they hang off is a client, an application or one variant
   of one. `scope` is not a foreign key (it names one of three tables), so the
   delete routes in catalogue.js purge these rows themselves.
   ------------------------------------------------------------ */

function infoDir(scope, scopeId) {
  return path.join(UPLOAD_DIR, 'info', `${scope}-${Number(scopeId) || 0}`);
}

function shapeInfoFile(row) {
  return {
    id: Number(row.id),
    scope: row.scope,
    scopeId: Number(row.scope_id),
    name: row.name,
    mime: row.mime || '',
    size: Number(row.size || 0),
    uploadedBy: row.uploaded_by ? Number(row.uploaded_by) : null,
    uploadedByName: row.uploaded_by_name || '',
    createdAt: row.created_at,
  };
}

async function infoFileRow(id) {
  const row = await db.get(
    `SELECT f.*, u.name AS uploaded_by_name
       FROM info_files f
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.id = ?`,
    [id]
  );
  if (!row) throw new HttpError(404, 'File not found');
  return row;
}

/** One stored file, and the folder that held it when it was the last one. */
async function removeInfoStored(scope, scopeId, storedName) {
  const dir = infoDir(scope, scopeId);
  await unlinkQuiet(path.join(dir, storedName));
  try {
    await fsp.rmdir(dir);
  } catch {
    // Not empty (a concurrent upload) or already gone. Neither is an error.
  }
}

/**
 * Removes the stored bytes for targets that are gone. The rows were already
 * deleted inside the caller's transaction, so nothing here can restore them —
 * this only stops the disk from keeping files no page can ever link to.
 */
export async function purgeInfoFileDirs(scope, ids) {
  for (const id of (ids || []).map(Number).filter(Boolean)) {
    await fsp.rm(infoDir(scope, id), { recursive: true, force: true });
  }
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
  /* ---------- files on the Information center ---------- */

  'GET /api/info-files': async (ctx) => {
    const scope = String(ctx.query.scope || '');
    const scopeId = Number(ctx.query.scopeId);
    assertInfoScope(scope);
    await assertScopeExists(scope, scopeId);
    const rows = await db.all(
      `SELECT f.*, u.name AS uploaded_by_name
         FROM info_files f
         LEFT JOIN users u ON u.id = f.uploaded_by
        WHERE f.scope = ? AND f.scope_id = ?
        ORDER BY f.created_at DESC, f.id DESC`,
      [scope, scopeId]
    );
    return { files: rows.map(shapeInfoFile) };
  },

  'POST /api/info-files': async (ctx) => {
    const body = ctx.body || {};
    const scope = String(body.scope || '');
    assertInfoScope(scope);
    const scopeId = Number(body.scopeId);
    await assertScopeExists(scope, scopeId);

    const data = typeof body.data === 'string' ? body.data.trim() : '';
    if (!data) throw new HttpError(400, 'No file contents were sent');
    if (!/^[A-Za-z0-9+/\s]*={0,2}$/.test(data)) throw new HttpError(400, 'File contents are not valid base64');

    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length) throw new HttpError(400, 'The file is empty');
    if (bytes.length > MAX_INFO_BYTES) throw new HttpError(413, INFO_SIZE_MESSAGE);

    const row = {
      scope,
      scope_id: scopeId,
      name: displayName(body.name),
      mime: safeMime(body.mime),
      size: bytes.length,
      stored_name: crypto.randomUUID(),
      uploaded_by: ctx.user.id,
      created_at: nowISO(),
    };

    const dir = infoDir(scope, scopeId);
    await fsp.mkdir(dir, { recursive: true });
    const target = path.join(dir, row.stored_name);
    await fsp.writeFile(target, bytes);
    try {
      const info = await db.run(
        `INSERT INTO info_files (scope, scope_id, name, mime, size, stored_name, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [row.scope, row.scope_id, row.name, row.mime, row.size, row.stored_name, row.uploaded_by, row.created_at]
      );
      return { file: shapeInfoFile(await infoFileRow(info.lastInsertId)) };
    } catch (err) {
      // Bytes without an index are garbage nothing can list or delete.
      await unlinkQuiet(target);
      throw err;
    }
  },

  'GET /api/info-files/:id/download': async (ctx) => {
    const row = await infoFileRow(ctx.params.id);
    const filePath = path.join(infoDir(row.scope, row.scope_id), row.stored_name);
    let stat = null;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      throw new HttpError(410, 'The stored file is missing — re-upload it');
    }

    const fallback = row.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    ctx.res.writeHead(200, {
      // Always a download, never the stored mime: an uploaded .html or .svg served
      // inline from this origin is stored XSS with extra steps.
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      'Content-Length': stat.size,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(fs.createReadStream(filePath), ctx.res);
    return HANDLED;
  },

  'DELETE /api/info-files/:id': async (ctx) => {
    requireDeleter(ctx, 'a file');
    const row = await infoFileRow(ctx.params.id);
    // Row first, bytes second: a row without bytes is a visible broken download,
    // bytes without a row are garbage only a `find` would ever reveal.
    await db.run('DELETE FROM info_files WHERE id = ?', [row.id]);
    await removeInfoStored(row.scope, row.scope_id, row.stored_name);
    return { ok: true, name: row.name };
  },
};
