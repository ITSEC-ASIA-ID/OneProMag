/**
 * The two long-text fields on a project, edited where they are read.
 *
 * Both the scope notes and the working notes are one field on the project, and
 * both are written in place: pressing "Edit" turns the box you were reading into
 * the box you type in, and nothing is covered. A modal was the wrong shape for
 * these two specifically — the text is the whole point, and a dialog re-flowed it
 * into a 7-row box under a dimmed page, so comparing "what did I write" with
 * "what should it say" meant remembering one of the two.
 *
 *   scope notes   what was agreed with the client. Changes rarely.
 *   working notes what was tried and found. Written while testing.
 *
 * They stay separate fields because they answer different questions, and the
 * person who asks "what did we agree?" is rarely asking "what did we find?".
 */
import { api } from './api.js';
import { icon } from './icons.js';
import { escapeHtml as h, toast } from './ui.js';


const FIELDS = {
  notes: {
    save: (projectId, text) => api.updateProject(projectId, { notes: text }),
    title: 'Notes',
    hint: 'Scope, credentials location, out-of-scope items. Only the notes change — name, client, SV and status stay as they are.',
    emptyTitle: 'No notes',
    emptyBody: 'Add scope details, credentials location, or out-of-scope items.',
    placeholder: 'Scope, credentials location, out-of-scope items…',
  },
  'pentest-notes': {
    save: (projectId, text) => api.savePentestNotes(projectId, text),
    title: 'Pentest notes',
    hint: 'What you tested and what you found. Kept apart from the scope notes, which say what was agreed.',
    emptyTitle: 'No pentest notes',
    emptyBody: 'Write down what you tried and what it showed, while it is still fresh.',
    placeholder: 'Replayed a session cookie after logout; the API still accepted it…',
  },
};


/**
 * The field at rest: the text, and one button that reveals the editor.
 *
 * `rows` differs per tab because the working note is usually longer, but both
 * grow with their content — a fixed rows count was what made the old modal feel
 * like a form instead of a notebook.
 */
export function notesFieldHTML(kind, value) {
  const field = FIELDS[kind];
  const text = String(value || '');
  return `<div class="nfield" data-nfield="${kind}">
    <div class="nfield-view">
      ${
        text
          ? `<div class="notes-block" data-nfield-text>${h(text)}</div>`
          : `<div class="empty empty-bare">
               <div class="icon">${icon.note()}</div>
               <h3>${h(field.emptyTitle)}</h3>
               <p>${h(field.emptyBody)}</p>
             </div>`
      }
      <div class="nfield-acts">
        <button type="button" class="btn btn-sm" data-nfield-edit>${icon.edit()} ${
          text ? 'Edit notes' : 'Add notes'
        }</button>
      </div>
    </div>
    <div class="nfield-edit" hidden>
      <label class="sr-only" for="nfield-${kind}">${h(field.title)}</label>
      <textarea class="textarea nfield-input" id="nfield-${kind}" rows="10"
        placeholder="${h(field.placeholder)}">${h(text)}</textarea>
      <div class="nfield-foot">
        <span class="hint">${h(field.hint)}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" data-nfield-cancel>Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" data-nfield-save>Save</button>
      </div>
    </div>
  </div>`;
}


/**
 * Wires one field. `reload` is the tab's own repaint, so the count in the tab
 * strip follows the text without the page reloading under the reader.
 */
export function bindNotesField(root, projectId, kind, reload) {
  const field = FIELDS[kind];
  const wrap = root.querySelector(`[data-nfield="${kind}"]`);
  if (!wrap) return;

  const view = wrap.querySelector('.nfield-view');
  const editor = wrap.querySelector('.nfield-edit');
  const input = wrap.querySelector('.nfield-input');
  const saveBtn = wrap.querySelector('[data-nfield-save]');
  wrap.dataset.saved = input.value;

  const open = () => {
    view.hidden = true;
    editor.hidden = false;
    // Focus at the end rather than selecting all: the common edit is adding a
    // paragraph, and a select-all makes the first keystroke destroy the note.
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    grow();
  };

  const close = () => {
    editor.hidden = true;
    view.hidden = false;
    // Re-render from the saved value, whatever it is: cancel must not leave
    // typed text sitting in a hidden box to reappear on the next open.
    input.value = wrap.dataset.saved;
  };

  // Grow with the content, so a long note is not read through a scrollbar.
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + 2}px`;
  };

  wrap.querySelector('[data-nfield-edit]').addEventListener('click', open);
  wrap.querySelector('[data-nfield-cancel]').addEventListener('click', close);
  input.addEventListener('input', grow);

  const save = async () => {
    const text = input.value.trim();
    saveBtn.disabled = true;
    try {
      await field.save(projectId, text);
      wrap.dataset.saved = text;
      // Emptying the box IS the deletion — there is no delete button to press,
      // so the toast has to say that it happened rather than "saved".
      toast(text ? `${field.title} saved` : `${field.title} cleared`);
      await reload();
    } catch (err) {
      toast(err.message, 'err');
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener('click', save);
  // Ctrl/Cmd+Enter saves without reaching for the button; Escape abandons the
  // edit the way every other in-place field does.
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
}
