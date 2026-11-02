import { api } from './api.js';
import { icon } from './icons.js';
import { canManageCatalog } from './state.js';
import { confirmDialog, escapeHtml as h, fmtRelative, toast } from './ui.js';

/* ============================================================
   Project attachments (drawer → Attachments)
   ------------------------------------------------------------
   Files that belong to an engagement: the signed scope, the client's asset
   list, a screenshot of the finding, the finished report.

   The bytes live on the server, so the browser never holds them: the download
   is a plain link the server answers with `Content-Disposition: attachment`,
   which is why nothing here fetches the file and hands it to a blob URL — the
   browser's own save dialog is the one control we do not have to build.

   Uploads go up as base64 JSON, capped at 20 MB on both sides. The limit is
   checked here first so the message is immediate, and again on the server,
   which is the check that actually counts.
   ============================================================ */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MB = 1024 * 1024;

/** `132 KB`, `4.2 MB` — a size a person can compare, not a byte count. */
export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}

function fileRowHTML(file) {
  const href = `/api/project-files/${file.id}/download`;
  const who = file.uploadedByName ? ` · ${h(file.uploadedByName)}` : '';
  return `<li class="file-row" data-file="${file.id}">
    <span class="file-icon">${icon.fileText(16)}</span>
    <div class="file-text">
      <a class="file-name" href="${href}" download>${h(file.name)}</a>
      <div class="file-meta">${fmtSize(file.size)}${who} · ${h(fmtRelative(file.createdAt))}</div>
    </div>
    <a class="btn btn-icon" href="${href}" download title="Download" aria-label="Download ${h(file.name)}">${icon.download()}</a>
    ${
      canManageCatalog()
        ? `<button class="btn btn-icon btn-icon-danger" data-file-del="${file.id}" title="Delete file" aria-label="Delete ${h(file.name)}">${icon.trash()}</button>`
        : ''
    }
  </li>`;
}

export function attachmentsTabHTML(files = []) {
  return `<div class="files">
    <div class="files-head">
      <span class="note-count">${files.length} file${files.length === 1 ? '' : 's'}</span>
      <div class="spacer"></div>
      <button class="btn btn-sm" data-file-add>${icon.upload(14)} Upload</button>
    </div>
    ${
      files.length
        ? `<ul class="file-list">${files.map(fileRowHTML).join('')}</ul>`
        : `<div class="empty">
             <div class="icon">${icon.fileText(24)}</div>
             <h3>No files yet</h3>
             <p>The scope, an asset list, the report — anything the engagement has to carry, up to 20 MB each.</p>
           </div>`
    }
  </div>`;
}

/**
 * Reads a File into base64 without blocking the page, then posts it.
 *
 * `FileReader` rather than `file.text()`/`arrayBuffer()` because base64 is what
 * the endpoint takes and the conversion is the browser's job, not ours.
 */
async function upload(projectId, file) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is ${fmtSize(file.size)} — the limit is 20 MB`);
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read "${file.name}"`));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(',');
  const data = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  if (!data) throw new Error(`"${file.name}" looks empty`);

  await api.uploadFile(projectId, {
    name: file.name,
    // The browser's guess is a hint for the list, never the download type: the
    // server always answers `application/octet-stream`.
    mime: file.type || 'application/octet-stream',
    data,
  });
}

/** `reload` re-renders the drawer's Attachments tab after a change. */
export function bindAttachmentsTab(el, project, files, reload) {
  el.querySelector('[data-file-add]')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'sr-only';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      try {
        toast(`Uploading ${file.name}…`);
        await upload(project.id, file);
        await reload();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
    document.body.appendChild(input);
    input.click();
  });

  el.querySelectorAll('[data-file-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const file = files.find((f) => f.id === Number(btn.dataset.fileDel));
      if (!file) return;
      const ok = await confirmDialog({
        title: 'Delete file?',
        message: `"${file.name}" will be deleted from this project. This cannot be undone.`,
        confirmLabel: 'Delete file',
      });
      if (!ok) return;
      try {
        await api.deleteFile(file.id);
        toast('File deleted');
        await reload();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });
}
