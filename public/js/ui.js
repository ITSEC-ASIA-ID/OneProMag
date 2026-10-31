import { icon, CATEGORY, STATUS, ENV, PLATFORM, AVAILABILITY } from './icons.js';
import { propKeys, propLabel, propTone } from './props.js';

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/**
 * Initials disc. With `userId` it becomes a button-like element carrying
 * `data-person`, so a list can delegate clicks to open that person's card
 * instead of every avatar needing its own listener.
 */
export const avatar = (name, cls = '', userId = null) =>
  `<span class="avatar ${cls}${userId ? ' avatar-link' : ''}" title="${escapeHtml(name)}"${
    userId ? ` data-person="${userId}" role="button" tabindex="0"` : ''
  }>${escapeHtml(initials(name))}</span>`;

export const avatarStack = (people, max = Infinity) => {
  if (!people || !people.length) {
    return `<span class="foot-item faint">${icon.user()} Unassigned</span>`;
  }
  // Everyone is shown. A "+N" chip told you a number but not WHO, so a project
  // with five testers looked identical to one with two — you still had to open
  // it to find out. Avatars are cheap to scan; the counter was not.
  const shown = max === Infinity ? people : people.slice(0, max);
  return `<span class="avatar-stack">${shown.map((p) => avatar(p.name, 'sm', p.id)).join('')}</span>`;
};

/**
 * Team cell for a list row: the avatar stack plus a one-click button that opens
 * the project form straight on the pentester picker, so assigning someone never
 * requires opening the drawer and hunting for Edit.
 */
export const teamCell = (people, projectId) => `
  <span class="team-cell">
    ${avatarStack(people)}
    <button class="btn btn-icon team-add" data-team-quick="${projectId}"
            title="Assign pentesters" aria-label="Assign pentesters">${icon.plus(12)}</button>
  </span>`;

/**
 * A status pill.
 *
 * The stored value and the printed word are no longer the same thing: an admin may
 * rename "Ongoing" to "In progress", and the badge has to follow the label while the
 * project row keeps the key. Tone comes from the same property, so a status added
 * later is coloured from the day it exists.
 */
export const statusBadge = (status) => {
  const tone = propTone('status', status, STATUS[status]?.tone || 'slate');
  return `<span class="badge ${status === 'Ongoing' ? 'pulse' : ''}" data-tone="${tone}"><span class="dot"></span>${escapeHtml(propLabel('status', status))}</span>`;
};

/**
 * Availability pill. `automatic` is shown as a subtle "auto" marker so a
 * supervisor can tell a derived status from one the pentester set by hand.
 */
export const availabilityBadge = (status, automatic = false) =>
  `<span class="badge avail-badge" data-tone="${AVAILABILITY[status]?.tone || 'slate'}">
     <span class="dot"></span>${escapeHtml(AVAILABILITY[status]?.label || status)}
     ${automatic ? '<em class="avail-auto">auto</em>' : ''}
   </span>`;

/**
 * A status pill that is also a one-click menu. Used on list rows and cards so
 * moving a project to another status never needs the full edit form.
 * `stopPropagation` matters because the whole card/row is clickable.
 */
export function quickStatus(status, projectId, opts = {}) {
  const statuses = opts.statuses || propKeys('status');
  // `kind` decides which endpoint the choice is written to. A retest row on the
  // Active list has its own status: sending that click to the project instead
  // changed the engagement while the row kept showing the retest.
  const kind = opts.kind || 'project';
  const items = statuses
    .map(
      (s) => `<button type="button" class="quick-status-item ${s === status ? 'on' : ''}"
        data-set-status="${s}" data-status-for="${projectId}" data-status-kind="${kind}">
        <span class="badge" data-tone="${propTone('status', s, STATUS[s]?.tone || 'slate')}"><span class="dot"></span>${escapeHtml(propLabel('status', s))}</span>
        ${s === status ? `<span class="qs-check">${icon.check(14)}</span>` : ''}
      </button>`
    )
    .join('');
  return `<span class="quick-status" data-quick-status="${projectId}" data-quick-kind="${kind}">
    <button type="button" class="quick-status-toggle" data-quick-toggle
      aria-haspopup="menu" aria-label="Change status">
      ${statusBadge(status)}${icon.chevronDown(13)}
    </button>
    <span class="quick-status-menu" role="menu" hidden>${items}</span>
  </span>`;
}

export const envBadge = (env) =>
  `<span class="badge badge-outline${env === 'Prod' ? ' is-prod' : ''}" data-tone="${
    ENV[env]?.tone || 'slate'
  }">${escapeHtml(env)}</span>`;

export const catBadge = (category, platform = '') => {
  const name = propLabel('category', category);
  // "Mobile Android" is one fact, so it is one pill. Rendering the platform as a
  // separate badge let a narrow cell wrap it onto its own line, which read as
  // two unrelated labels stacked on top of each other.
  const label = category === 'Mobile' && platform ? `${name} ${platform}` : name;
  const tone = propTone('category', category, CATEGORY[category]?.tone || 'slate');
  return `<span class="badge" data-tone="${tone}">${escapeHtml(label)}</span>`;
};

export const catIcon = (category, size = 16) => {
  // A category the admin added has no glyph of its own; the tag stands in rather
  // than borrowing Web's globe, which would claim it was a web app.
  const meta = CATEGORY[category] || { icon: 'tag' };
  return icon[meta.icon](size);
};

export const methodBadge = (method) =>
  `<span class="badge badge-outline">${escapeHtml(method)}</span>`;

/* ---------- dates ---------- */
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Whole days between an ISO date and today, never negative. Used by the team
 * board's "idle since" column; the server computes the same number for totals.
 */
export function daysSince(iso) {
  if (!iso) return 0;
  const then = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - then.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

export function fmtRelative(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- toast ---------- */
let toastHost = null;
export function toast(message, variant = 'ok') {
  toastHost = toastHost || document.getElementById('toast-host');
  if (!toastHost) return;
  const el = document.createElement('div');
  el.className = `toast ${variant === 'err' ? 'err' : ''}`;
  el.innerHTML = `<span class="inline-flex">${
    variant === 'err' ? icon.alert() : icon.check()
  }</span><span>${escapeHtml(message)}</span>`;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2600);
}

/* ---------- modal ---------- */
let modalStack = [];

export function openModal({ title, subtitle = '', body, footer, wide = false, xwide = false, initialFocus = '', onMount, onClose }) {
  const host = document.getElementById('modal-host');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}${xwide ? ' xwide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <div class="flex-1 min-0">
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button class="btn btn-icon" data-close aria-label="Close">${icon.x()}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  // One controller per modal, aborted on close. Everything registered on
  // `document` by the modal's own wiring takes `signal`, so it dies with the
  // dialog instead of accumulating: `openProjectForm` used to install three
  // document listeners per open (one per combobox) that were never removed,
  // each closing over the modal body, so the detached subtree could never be
  // collected. `bindCombobox` even stored a `_cleanup` that nobody called.
  const ctrl = new AbortController();
  // Restoring focus is not cosmetic: without it, closing a dialog drops the
  // keyboard user at the top of the document with no idea where they were.
  const opener =
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

  const close = () => {
    ctrl.abort();
    backdrop.remove();
    modalStack = modalStack.filter((m) => m !== close);
    document.removeEventListener('keydown', onKey);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack[modalStack.length - 1] === close) {
      e.stopPropagation();
      close();
    }
  };

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  host.appendChild(backdrop);
  modalStack.push(close);

  const modal = backdrop.querySelector('.modal');
  onMount?.(modal, close, ctrl.signal);

  requestAnimationFrame(() => {
    // A caller that knows where attention belongs can pass an `initialFocus`
    // selector; otherwise fall back to the first sensible control.
    const preferred = initialFocus ? modal.querySelector(initialFocus) : null;
    const first =
      preferred ||
      modal.querySelector(
        'input:not([type=hidden]):not([disabled]), textarea, select, button.btn-primary'
      );
    first?.focus({ preventScroll: true });
  });

  return { close, modal };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let settled = false;
    const { close } = openModal({
      title,
      body: `<p class="confirm-text">${escapeHtml(message)}</p>`,
      footer: `
        <div class="spacer"></div>
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>`,
      onMount: (modal, closeFn) => {
        modal.querySelector('[data-cancel]').addEventListener('click', () => {
          settled = true;
          closeFn();
          resolve(false);
        });
        modal.querySelector('[data-confirm]').addEventListener('click', () => {
          settled = true;
          closeFn();
          resolve(true);
        });
      },
      onClose: () => !settled && resolve(false),
    });
    void close;
  });
}

/* ---------- segmented control ---------- */
/**
 * A segmented control.
 *
 * `options` may be plain strings, or `{ value, label }` pairs — the project category
 * and status pickers use the second form now that a stored key ("Ongoing") and the
 * word shown ("In progress") are allowed to differ.
 */
export function segmented(name, options, value, toneMap = {}) {
  const items = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : { value: opt.value, label: opt.label }
  );
  return `<div class="segmented" data-segmented="${name}">
    ${items
      .map(
        (opt) =>
          `<button type="button" data-value="${escapeHtml(opt.value)}" data-tone="${
            toneMap[opt.value] || ''
          }" class="${opt.value === value ? 'on' : ''}">${escapeHtml(opt.label)}</button>`
      )
      .join('')}
  </div>`;
}

/**
 * Binds a segmented control. `onChange(value)` is optional: the project form
 * uses it to reveal the Mobile platform selector only when Category = Mobile.
 */
export function bindSegmented(root, name, onChange) {
  const group = root.querySelector(`[data-segmented="${name}"]`);
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    group.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    onChange?.(btn.dataset.value);
  });
}

export function segmentedValue(root, name) {
  const btn = root.querySelector(`[data-segmented="${name}"] button.on`);
  return btn ? btn.dataset.value : null;
}

/* ---------- theme ---------- */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('opm-theme', theme);
}

export function currentTheme() {
  return localStorage.getItem('opm-theme') || 'light';
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/* --- pentester hierarchy ------------------------------------------------ */
const SUBROLE_RANK = { Lead: 0, 'Sub Lead': 1, Member: 2, Intern: 3 };

/** Sorts pentesters Lead -> Sub Lead -> Member -> Intern, then by name. */
export function sortPentesters(list = []) {
  return [...list].sort(
    (a, b) =>
      (SUBROLE_RANK[a.subrole] ?? 9) - (SUBROLE_RANK[b.subrole] ?? 9) ||
      String(a.name).localeCompare(String(b.name))
  );
}

/** Small pill showing a pentester's hierarchy level. */
export function subroleBadge(subrole) {
  const tone =
    subrole === 'Lead'
      ? 'violet'
      : subrole === 'Sub Lead'
        ? 'blue'
        : subrole === 'Intern'
          ? 'cyan'
          : 'slate';
  return `<span class="badge subrole" data-tone="${tone}">${escapeHtml(subrole || 'Member')}</span>`;
}

/**
 * Platform pill — only rendered for Mobile projects.
 * Wording/tone/glyph come from the PLATFORM map in icons.js so adding a
 * platform (e.g. the mobile API backend) never needs a change here.
 */
export function platformBadge(platform, opts = {}) {
  if (!platform) return '';
  const meta = PLATFORM[platform] || { tone: 'slate', label: platform };
  const glyph = icon[meta.icon] ? icon[meta.icon](11) : '';
  const label = meta.label;
  return `<span class="badge platform-badge" data-tone="${meta.tone}">${glyph}${escapeHtml(label)}</span>`;
}

/** Avatar + name + hierarchy pill, used in lists and the drawer. */
export function pentesterRow(p, opts = {}) {
  return `<span class="prow">
    ${avatar(p.name, opts.small ? 'sm' : '')}
    <span class="prow-name">${escapeHtml(p.name)}</span>
    ${opts.showSubrole === false ? '' : subroleBadge(p.subrole)}
  </span>`;
}

/* ============================================================
   project supervisor cell
   ============================================================ */
/**
 * The one project supervisor of a project, rendered as an avatar pill so the table
 * and card can show a person rather than a bare name. Falls back to a muted
 * "No SV" so an unowned engagement is visible instead of silently blank.
 */
export function supervisorCell(person, cls = '') {
  const name = typeof person === 'string' ? person : person?.name || '';
  const id = typeof person === 'string' ? null : person?.id || null;
  if (!name) {
    return `<span class="sv-cell sv-empty ${cls}">${icon.userCheck(13)}<span>No SV</span></span>`;
  }
  // Icon only: the name is redundant once it is a clickable person, and the
  // column header says SV. The title still spells the name out for tooltips and
  // for anyone scanning without hovering.
  return `<span class="sv-cell ${cls}">${avatar(name, 'sm', id)}</span>`;
}

/**
 * Phone + email pair, used in the drawer, supervisor lists and the team tree.
 *
 * The value sits in its own `<span class="ci-text">` rather than as a bare text node:
 * a list row has one line to spend on a contact detail, and an anonymous flex item
 * cannot be ellipsised — `text-overflow` applies to the item, not to the flex
 * container around it.
 */
export function contactLine(phone, email) {
  const parts = [];
  if (phone) {
    parts.push(
      `<a class="contact-item" href="tel:${escapeHtml(phone.replace(/[^+\d]/g, ''))}">${icon.call(12)}<span class="ci-text">${escapeHtml(phone)}</span></a>`
    );
  }
  if (email) {
    parts.push(
      `<a class="contact-item" href="mailto:${escapeHtml(email)}">${icon.mail(12)}<span class="ci-text">${escapeHtml(email)}</span></a>`
    );
  }
  return parts.length ? `<span class="contact-line">${parts.join('')}</span>` : '';
}

/* ============================================================
   searchable combobox — a <select> you can type into
   ============================================================ */
/**
 * Renders a searchable dropdown. The chosen id lives in a hidden input so the
 * surrounding form code can still read `.value` like a plain <select>.
 *
 * items: [{ value, label, sub }]
 */
export function combobox({ id, items = [], value = '', placeholder = 'Select…', searchPlaceholder = 'Search…' }) {
  const selected = items.find((i) => String(i.value) === String(value));
  // The option list lives in a JSON script tag so bindCombobox() can filter it
  // without the caller having to hand the array over a second time.
  const payload = JSON.stringify(items).replace(/</g, '\\u003c');
  return `
    <div class="combo" data-combo="${id}" data-placeholder="${escapeHtml(placeholder)}">
      <input type="hidden" id="${id}" value="${escapeHtml(String(value ?? ''))}" />
      <button type="button" class="combo-toggle" data-combo-toggle aria-haspopup="listbox">
        <span class="combo-label ${selected ? '' : 'is-placeholder'}">${
          selected ? escapeHtml(selected.label) : escapeHtml(placeholder)
        }</span>
        ${icon.chevronDown(15)}
      </button>
      <div class="combo-panel" data-combo-panel hidden>
        <div class="combo-search">
          ${icon.search()}
          <input class="input" data-combo-search placeholder="${escapeHtml(searchPlaceholder)}"
                 autocomplete="off" role="combobox" aria-expanded="true" />
        </div>
        <div class="combo-list" data-combo-list role="listbox"></div>
        <div class="combo-empty" data-combo-empty hidden>${icon.search()} No match</div>
      </div>
      <script type="application/json" data-combo-items>${payload}</script>
    </div>`;
}

/** Replaces a combobox's options (used when the selected client changes). */
export function setComboboxItems(root, id, items, value = '') {
  const box = root.querySelector(`[data-combo="${id}"]`);
  if (!box) return;
  box._items = items;
  const payload = box.querySelector('[data-combo-items]');
  if (payload) payload.textContent = JSON.stringify(items).replace(/</g, '\\u003c');
  const input = box.querySelector(`#${id}`);
  if (input) input.value = value ?? '';
  const selected = items.find((i) => String(i.value) === String(value));
  const label = box.querySelector('.combo-label');
  if (label) {
    label.textContent = selected ? selected.label : box.dataset.placeholder || 'Select…';
    label.classList.toggle('is-placeholder', !selected);
  }
  renderComboList(box, '');
}

/** Programmatically selects an option (no onChange) — used for auto-fill. */
export function setComboboxValue(root, id, value) {
  const box = root.querySelector(`[data-combo="${id}"]`);
  if (!box) return;
  const items =
    box._items ||
    (() => {
      try {
        return JSON.parse(box.querySelector('[data-combo-items]')?.textContent || '[]');
      } catch {
        return [];
      }
    })();
  if (!box._items) box._items = items;
  const input = box.querySelector(`#${id}`);
  if (input) input.value = value ?? '';
  const selected = items.find((i) => String(i.value) === String(value));
  const label = box.querySelector('.combo-label');
  if (label) {
    label.textContent = selected ? selected.label : box.dataset.placeholder || 'Select…';
    label.classList.toggle('is-placeholder', !selected);
  }
  renderComboList(box, '');
}

function renderComboList(box, needle) {
  const list = box.querySelector('[data-combo-list]');
  const empty = box.querySelector('[data-combo-empty]');
  const items = box._items || [];
  const current = box.querySelector('input[type=hidden]')?.value || '';
  const hits = items.filter((i) => {
    if (!needle) return true;
    return `${i.label} ${i.sub || ''}`.toLowerCase().includes(needle);
  });

  list.innerHTML = hits.length
    ? hits
        .map(
          (i) => `<button type="button" class="combo-item ${String(i.value) === String(current) ? 'on' : ''}"
            data-value="${escapeHtml(String(i.value))}" role="option">
            <span class="combo-item-label">${escapeHtml(i.label)}</span>
            ${i.sub ? `<span class="combo-item-sub">${escapeHtml(i.sub)}</span>` : ''}
            ${String(i.value) === String(current) ? `<span class="combo-check">${icon.check(14)}</span>` : ''}
          </button>`
        )
        .join('')
    : '';
  if (empty) empty.hidden = hits.length > 0;
}

/**
 * Wires a combobox. `onChange(value, item)` fires when the user picks an option.
 */
export function bindCombobox(root, id, onChange, signal) {
  const box = root.querySelector(`[data-combo="${id}"]`);
  if (!box) return;
  if (!box._items || !box._items.length) {
    try {
      box._items = JSON.parse(box.querySelector('[data-combo-items]')?.textContent || '[]');
    } catch {
      box._items = [];
    }
  }

  const toggle = box.querySelector('[data-combo-toggle]');
  const panel = box.querySelector('[data-combo-panel]');
  const search = box.querySelector('[data-combo-search]');

  const open = () => {
    // only one panel open at a time across the document
    document.querySelectorAll('.combo-panel:not([hidden])').forEach((p) => {
      if (p !== panel) p.hidden = true;
    });
    panel.hidden = false;
    search.value = '';
    renderComboList(box, '');
    requestAnimationFrame(() => search.focus());
  };
  const close = () => {
    panel.hidden = true;
  };

  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));

  search.addEventListener('input', () => renderComboList(box, search.value.trim().toLowerCase()));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close the dropdown only — never the surrounding modal.
      e.preventDefault();
      e.stopPropagation();
      close();
      toggle.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = panel.querySelector('.combo-item:not([hidden])');
      first?.click();
    }
  });

  panel.addEventListener('click', (e) => {
    const item = e.target.closest('.combo-item');
    if (!item) return;
    const value = item.dataset.value;
    const hidden = box.querySelector('input[type=hidden]');
    if (hidden) hidden.value = value;
    const chosen = (box._items || []).find((i) => String(i.value) === String(value));
    const label = box.querySelector('.combo-label');
    if (label) {
      label.textContent = chosen ? chosen.label : item.querySelector('.combo-item-label')?.textContent || value;
      label.classList.remove('is-placeholder');
    }
    close();
    toggle.focus();
    onChange?.(value, chosen);
  });

  // Clicking anywhere else closes the panel. Bound with the modal's signal, so
  // the listener leaves with the dialog (it used to be stored as `_cleanup` and
  // never called, keeping the whole modal subtree alive).
  const onDocDown = (e) => {
    if (!box.contains(e.target)) close();
  };
  document.addEventListener('mousedown', onDocDown, { signal });
}

/* ============================================================
   person card (click a SV or a pentester)
   ============================================================ */
/** Small clickable chip used for the project lists on a person card. */
const personProjectChip = (p) =>
  `<button type="button" class="person-proj" data-person-open="${p.id}">
    <span class="pp-name">${escapeHtml(p.name)}</span>
    ${statusBadge(p.status)}
  </button>`;

/**
 * The body of the person modal. Kept here rather than in app.js so the card can
 * be rendered from anywhere (project table, card grid, team board) without
 * those places needing to know how a person is shaped.
 */
export function personCardHTML(data, opts = {}) {
  const { person, supervisorOf = [], pentesterOn = [], reports = [] } = data;
  // `compact` drops the two "which projects" blocks. It is what the project list
  // asks for: there the row already IS a project, so the person card answers "who
  // is this" and stops — the full load belongs to the team board, where the
  // question is "how busy is this person".
  const showProjects = !opts.compact;
  const openProjects = pentesterOn.filter((p) => p.status !== 'Done');
  const doneProjects = pentesterOn.filter((p) => p.status === 'Done');

  // A project manager has no level in the pentest tree, so "Member · Project
  // Manager" would invent one. Admins keep theirs — they can still be a lead.
  const roleLine =
    person.role === 'Project Manager'
      ? person.role
      : [person.subrole || 'Member', person.role].filter(Boolean).join(' · ');

  return `
    <div class="person-card">
      <div class="pc-head">
        ${avatar(person.name, 'lg')}
        <div class="pc-id">
          <h3>${escapeHtml(person.name)}</h3>
          <div class="pc-role">${escapeHtml(roleLine)}${
            person.username ? ` <span class="pc-user">@${escapeHtml(person.username)}</span>` : ''
          }</div>
        </div>
        <span class="badge avail-badge" data-tone="${
          (AVAILABILITY[person.status] || {}).tone || 'slate'
        }">${escapeHtml(person.status)}${
          // Only label it "auto" for people the team board derives it for: a
          // project manager's On Project is about engagements they own, not bench
          // availability.
          person.automatic && person.role !== 'Project Manager'
            ? '<em class="avail-auto">auto</em>'
            : ''
        }</span>
      </div>

      ${
        person.phone || person.email
          ? `<div class="pc-contacts">${contactLine(person.phone, person.email)}</div>`
          : `<div class="pc-contacts pc-none">No contact details on file</div>`
      }

      ${
        person.availabilityNote
          ? `<div class="pc-note">${icon.note(13)}<span>${escapeHtml(person.availabilityNote)}</span></div>`
          : ''
      }

      ${
        showProjects && supervisorOf.length
          ? `<div class="pc-block">
               <div class="pc-block-label">${icon.userCheck(13)} Project supervisor for<em>${supervisorOf.length}</em></div>
               <div class="pc-projects">${supervisorOf.map(personProjectChip).join('')}</div>
             </div>`
          : ''
      }

      ${
        !showProjects || person.role === 'Project Manager'
          ? ''
          : `<div class="pc-block">
               <div class="pc-block-label">${icon.users(13)} Pentesting<em>${openProjects.length} active${
                 doneProjects.length ? ` · ${doneProjects.length} done` : ''
               }</em></div>
               ${
                 pentesterOn.length
                   ? `<div class="pc-projects">${pentesterOn.map(personProjectChip).join('')}</div>`
                   : `<div class="pc-empty">Not assigned to any project.</div>`
               }
             </div>`
      }

      ${
        reports.length
          ? `<div class="pc-block">
               <div class="pc-block-label">${icon.layers(13)} Reporting to this person<em>${reports.length}</em></div>
               <div class="pc-reports">${reports
                 .map(
                   (r) =>
                     `<button type="button" class="pc-report" data-person-open="${r.id}">${avatar(
                       r.name,
                       'sm',
                       r.id
                     )}<span>${escapeHtml(r.name)}</span>${subroleBadge(r.subrole)}</button>`
                 )
                 .join('')}</div>
             </div>`
          : ''
      }
    </div>`;
}

/**
 * Minimal, dependency-free Markdown for the notes sheet.
 *
 * Deliberately NOT a full Markdown implementation: only the handful of things a
 * pentest note actually uses (headings, bold, italics, inline code, fenced code,
 * bullet/numbered lists, links, and simple pipe tables). Anything unrecognised
 * passes through as literal text, which keeps credentials like `Pa$$w0rd_<x>`
 * intact instead of being mangled into emphasis or tags.
 *
 * SECURITY: every fragment is escaped BEFORE any markup is inserted, and the
 * only HTML this function emits is from its own fixed tag set. Link hrefs are
 * restricted to http(s)/mailto so a `javascript:` URL in a pasted note cannot
 * become a live XSS vector, and they always carry rel="noopener noreferrer".
 */
export function renderMarkdown(source) {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return '';

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Only http/https/mailto survive; anything else renders as plain text. */
  const safeHref = (raw) => {
    const url = raw.trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
  };

  /** Inline spans. Code first so `**` inside backticks stays literal. */
  const inline = (raw) => {
    const codes = [];
    let s = esc(raw).replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });
    // Links: [label](url). The URL pattern allows one level of balanced
    // parentheses, because a real URL may contain them — without this,
    // `[x](javascript:alert(1))` consumed only up to the first `)` and left a
    // stray bracket behind in the rendered text.
    s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))+)\)/g, (whole, label, url) => {
      const href = safeHref(url.replace(/&amp;/g, '&'));
      // A rejected scheme returns the original source verbatim: dropping it to
      // just the label silently deleted text the user wrote.
      if (!href) return whole;
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    s = s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  };

  const out = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code: kept verbatim (only escaped) because alignment matters.
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const body = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(`<pre class="md-code"><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Heading.
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 6); // never emit an <h1> inside the card
      out.push(`<h${level} class="md-h">${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<hr class="md-hr" />');
      i += 1;
      continue;
    }

    // Pipe table: a header row followed by a separator row.
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const cellsOf = (l) =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const head = cellsOf(line);
      i += 2;
      const body = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        body.push(cellsOf(lines[i]));
        i += 1;
      }
      out.push(
        `<div class="md-tablewrap"><table class="md-table"><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${head.map((_, ci) => `<td>${inline(r[ci] ?? '')}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    // Blockquote: consecutive `>` lines become one quote. The `>` marker must be
    // consumed here, otherwise it reaches the paragraph branch and renders as a
    // literal "&gt;" — which is what users would read as a bug.
    const quote = /^\s*>\s?(.*)$/;
    if (quote.test(line)) {
      const body = [];
      while (i < lines.length && quote.test(lines[i])) {
        body.push(quote.exec(lines[i])[1]);
        i += 1;
      }
      out.push(`<blockquote class="md-quote">${body.map((l) => inline(l)).join('<br />')}</blockquote>`);
      continue;
    }

    // Lists: consecutive items of the same kind become one list.
    const bullet = /^\s*[-*+]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(re.exec(lines[i])[1]);
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag} class="md-list">${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // Paragraph: consecutive plain lines join with a <br> so single newlines in
    // a pasted block keep their visual line breaks.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(#{1,6}\s|`{3,}|~{3,}|[-*+]\s|\d+[.)]\s)/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])
    ) {
      para.push(inline(lines[i]));
      i += 1;
    }
    if (para.length) out.push(`<p class="md-p">${para.join('<br />')}</p>`);
  }

  return out.join('');
}
