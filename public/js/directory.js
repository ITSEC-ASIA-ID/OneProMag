import { syncTableOverflow } from './devices.js';
import { mountContent } from './projects.js';
import { isCurrentLoad, nextLoadToken, openPerson } from './shared.js';
import { state } from './state.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { avatar, escapeHtml as h, subroleBadge, toast } from './ui.js';



/* ============================================================
   Staff directory (Workspace → Users)
   ------------------------------------------------------------
   The read-only answer to "who works here": every account, one row
   each, with the role and the two contact details the team actually
   uses. It is deliberately a table and not the admin tree — looking a
   person up is a lookup, and hierarchy is the wrong shape for that.
   Management (create, import, move in the tree) stays in the Admin
   panel, one page over.
   ============================================================ */
/**
 * Who the directory is FOR: people you might need to ask something.
 *
 * Admin accounts are excluded on purpose. An administrator is operations — they
 * appear in Manage users, and listing them here invites a tester to ask the wrong
 * person about a retest.
 */
export const DIRECTORY_GROUPS = [
  {
    role: 'Project Manager',
    label: 'Project managers',
    note: 'Own the engagement and the client relationship',
  },
  {
    role: 'Pentester',
    label: 'Pentesters',
    note: 'Do the testing',
  },
];


export function directoryPeople() {
  return (state.directory || []).filter((u) => u.role !== 'Admin');
}


export function directoryHTML() {
  const all = directoryPeople();
  const q = (state.dirQuery || '').trim();
  const rows = directoryMatches(all, q);

  return `<div class="dir-page">
    <div class="dev-head">
      <div>
        <h2>Users</h2>
        <p class="dev-sub">${all.length} ${all.length === 1 ? 'person' : 'people'} you can ask —
          supervisors and pentesters</p>
      </div>
    </div>
    <div class="dev-bar">
      <div class="search dev-search">
        ${icon.search()}
        <input class="input" id="dir-search" placeholder="Search name, role, e-mail or phone…"
          autocomplete="off" aria-label="Search users" value="${h(q)}" />
        <button class="btn btn-sm dev-clear" data-dir-clear ${q ? '' : 'hidden'}>Clear</button>
      </div>
    </div>
    <div id="dir-results">${directoryGroupsHTML(rows, q)}</div>
  </div>`;
}


/**
 * The two groups, in that order, each with its own count.
 *
 * One alphabetical table answered "who is this?" but not "who do I ask about the
 * project" — the role was a column you had to read past. A group per role makes the
 * answer a heading. Groups with no matches disappear, so a search for a supervisor
 * leaves one section rather than an empty one.
 */
export function directoryGroupsHTML(rows, q) {
  if (!rows.length) return directoryTableHTML(rows, q); // renders the empty state
  return DIRECTORY_GROUPS.map((group) => {
    const list = rows.filter((u) => u.role === group.role);
    if (!list.length) return '';
    return `<section class="dir-group">
      <div class="dir-group-head">
        <h3>${h(group.label)}<span class="dir-count">${list.length}</span></h3>
        <p>${h(group.note)}</p>
      </div>
      ${directoryTableHTML(list)}
    </section>`;
  }).join('');
}


/** Phone numbers, normalized so the country code does not decide the result. */
export function digitsOnly(value) {
  return String(value || '')
    .replace(/[^\d]/g, '')
    // +62 812 … and 0812 … are the same phone to everyone except a string compare.
    .replace(/^62/, '0');
}


/**
 * Every column of a person, so one search box answers every way of asking.
 *
 * The phone is also matched on digits alone: a number read off a screen as
 * "+62 812 1000 0005" is typed back as "0812 1000 0005", and a plain substring test
 * found nothing.
 */
export function directoryMatches(list, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return list;
  const digits = digitsOnly(needle);
  return list.filter((u) => {
    if (
      [u.name, u.role, u.subrole, u.email, u.phone, u.username]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    ) {
      return true;
    }
    return digits.length >= 4 && digitsOnly(u.phone).includes(digits);
  });
}


/**
 * The role column: the ROLE, plus the pentest level when the account has one.
 *
 * A lead and a member are both "Pentester", and which one they are is the thing you
 * need before you ask them for anything — so the level rides along as a chip rather
 * than being a fifth column nobody asked for.
 */
export function directoryRoleHTML(person) {
  const role =
    person.role === 'Project Manager'
      ? 'Project Manager'
      : person.role === 'Admin'
        ? 'Admin'
        : 'Pentester';
  const level = person.role === 'Project Manager' ? '' : person.subrole;
  return `<span class="dir-role"><span class="dir-role-name">${h(role)}</span>${
    level ? subroleBadge(level) : ''
  }</span>`;
}


export function directoryTableHTML(rows, q) {
  if (!rows.length) {
    return `<div class="empty">
        <div class="icon">${icon.users(26)}</div>
        <h3>${q ? `No one matches “${h(q)}”` : 'Nobody here yet'}</h3>
        <p>${
          q
            ? 'The search looks at the name, role, e-mail and phone number.'
            : 'Accounts are created in the Admin panel, under Manage users.'
        }</p>
      </div>`;
  }

  return `<div class="dev-tablewrap" data-dir-scroll>
      <span class="dev-scrollfx left" aria-hidden="true"></span>
      <span class="dev-scrollfx right" aria-hidden="true"></span>
      <table class="dev-table">
        <thead><tr>
          <th class="dev-h-name"><span class="dev-h-inner"><span class="dev-h-label">Full name</span></span></th>
          <th class="dev-h-role"><span class="dev-h-inner"><span class="dev-h-label">Role</span></span></th>
          <th class="dev-h-email"><span class="dev-h-inner"><span class="dev-h-label">E-mail</span></span></th>
          <th class="dev-h-phone"><span class="dev-h-inner"><span class="dev-h-label">Number phone</span></span></th>
        </tr></thead>
        <tbody>${rows
          .map(
            (u) => `<tr data-dir-row="${u.id}">
            <td class="dev-name"><span class="dir-person">${avatar(u.name, 'sm', u.id)}<span>${h(u.name)}</span></span></td>
            <td data-label="Role">${directoryRoleHTML(u)}</td>
            <td class="dev-mono-cell" data-label="E-mail">${
              u.email
                ? `<a href="mailto:${h(u.email)}" title="${h(u.email)}">${h(u.email)}</a>`
                : '<span class="dev-empty-cell">—</span>'
            }</td>
            <td class="dev-mono-cell" data-label="Number phone">${
              u.phone
                ? `<a href="tel:${h(String(u.phone).replace(/[^+\d]/g, ''))}" title="${h(u.phone)}">${h(u.phone)}</a>`
                : '<span class="dev-empty-cell">—</span>'
            }</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>
    <p class="dev-scrollhint">${icon.chevronRight(12)} Scroll sideways for the remaining columns</p>`;
}


export async function loadDirectory() {
  const token = nextLoadToken('directory');
  try {
    const res = await api.directory();
    if (!isCurrentLoad('directory', token)) return;
    state.directory = res.users || [];
  } catch (err) {
    if (!isCurrentLoad('directory', token)) return;
    state.directory = [];
    toast(err.message, 'err');
  }
  if (state.nav === 'directory') mountContent();
}


export function bindDirectory() {
  const content = document.getElementById('content');
  if (!content) return;

  const host = content.querySelector('#dir-results');
  const repaint = () => {
    if (!host) return;
    const query = (state.dirQuery || '').trim();
    // Same two groups as the first paint — filtering must not flatten the page back
    // into one table, which is what a call to directoryTableHTML() alone did.
    host.innerHTML = directoryGroupsHTML(directoryMatches(directoryPeople(), query), query);
    const clear = content.querySelector('[data-dir-clear]');
    if (clear) clear.hidden = !query;
    host.querySelectorAll('[data-dir-scroll]').forEach((wrap) => syncTableOverflow(wrap));
  };

  const search = content.querySelector('#dir-search');
  if (search) {
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.dirQuery = search.value;
        repaint();
      }, 140);
    });
  }
  content.querySelector('[data-dir-clear]')?.addEventListener('click', () => {
    state.dirQuery = '';
    if (search) {
      search.value = '';
      search.focus();
    }
    repaint();
  });

  // Same click-through as every other avatar in the app: the face opens the card.
  // Bound on the page wrapper, which `mountContent` re-creates — a listener on the
  // stable `#content` would stack a new copy on every render.
  content.querySelector('.dir-page')?.addEventListener('click', (ev) => {
    const face = ev.target.closest('[data-person]');
    if (!face) return;
    ev.preventDefault();
    openPerson(Number(face.dataset.person));
  });

  const wrap = content.querySelector('[data-dir-scroll]');
  if (wrap) syncTableOverflow(wrap);
}
