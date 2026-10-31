import { mountContent } from './projects.js';
import { PM_ROLE, USER_TABS, clientById, currentQuery, openPerson } from './shared.js';
import { bindSidebar, sidebarHTML } from './shell.js';
import { ENUMS, root, state } from './state.js';
import { api } from './api.js';
import { icon } from './icons.js';
import {
  avatar, bindSegmented, confirmDialog, contactLine,
  escapeHtml as h, initials, openModal, segmented,
  segmentedValue, setComboboxValue, sortPentesters, subroleBadge,
  toast,
} from './ui.js';


export function usersHTML() {
  const pentesters = state.pentesters || [];
  const supervisors = state.supervisors || [];
  const tab = USER_TABS.some((t) => t.id === state.usersTab) ? state.usersTab : 'all';
  const tabLabel = USER_TABS.find((t) => t.id === tab).label;
  // `/api/supervisors` returns the pool (Supervisor accounts AND pentesters, because
  // a pentester may supervise), so the account count has to dedupe by id.
  const total = new Set([...pentesters, ...supervisors].map((u) => Number(u.id))).size;

  return `<div class="admin">
    <div class="admin-head">
      <p>
        Everyone who can sign in. Pentesters are arranged as a reporting tree — lead,
        sub lead, member, intern — and supervisors own the engagements.
      </p>
      <div class="head-acts">
        <button class="btn" data-users-import>${icon.upload(15)} Import</button>
        <button class="btn btn-primary" data-user-new>${icon.plus()} New user</button>
      </div>
    </div>
    <div class="admin-tabs">
      ${segmented('users-tab', USER_TABS.map((t) => t.label), tabLabel)}
      <span class="admin-count">${total} account${total === 1 ? '' : 's'}</span>
    </div>
    ${tab === 'supervisors' ? '' : pentesterSectionHTML()}
    ${tab === 'pentesters' ? '' : supervisorSectionHTML()}
  </div>`;
}


/** The pentest tree: one section, with its own add control at the top. */
export function pentesterSectionHTML() {
  const leads = state.pentesterTree || [];
  const n = (state.pentesters || []).length;
  const head = `<div class="admin-sec-head">
      <h3>Pentesters</h3>
      <span class="admin-count">${n}</span>
      <p>Sub leads report to a lead; members and interns attach to whoever runs their work.</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-pent-add="Lead">${icon.plus(13)} Lead</button>
    </div>`;

  if (!leads.length) {
    return `<section class="admin-sec">${head}
      <div class="empty">
        <div class="icon">${icon.users(26)}</div>
        <h3>No pentesters yet</h3>
        <p>Start with a lead, then add the sub leads and members under them — or import the whole team at once.</p>
        <button class="btn btn-primary" data-pent-add="Lead">${icon.plus()} New lead</button>
      </div>
    </section>`;
  }

  return `<section class="admin-sec">${head}
    <div class="tree">${leads.map((lead) => leadNodeHTML(lead)).join('')}</div>
  </section>`;
}


/** The project managers, as cards: who they are and which clients they own. */
export function supervisorSectionHTML() {
  // Cards for the Project Manager ROLE only: a pentester who supervises one engagement
  // already has a row in the tree above, and a second card would read as a
  // duplicate person.
  const supervisors = (state.supervisors || []).filter((u) => u.role === PM_ROLE);
  const head = `<div class="admin-sec-head">
      <h3>Project managers</h3>
      <span class="admin-count">${supervisors.length}</span>
      <p>Each project has one, and a client can name several as its usual owners. A pentester can supervise too — pick them on the project itself.</p>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-supervisor-add>${icon.plus(13)} Project manager</button>
    </div>`;

  if (!supervisors.length) {
    return `<section class="admin-sec">${head}
      <div class="empty">
        <div class="icon">${icon.userCheck(26)}</div>
        <h3>No project managers yet</h3>
        <p>Add one, then give them a client or two so new projects are owned automatically.</p>
        <button class="btn btn-primary" data-supervisor-add>${icon.plus()} New project manager</button>
      </div>
    </section>`;
  }

  return `<section class="admin-sec">${head}
    <div class="client-grid">${supervisors.map(supervisorCardHTML).join('')}</div>
  </section>`;
}


/**
 * The interns of one person, as rows under them.
 *
 * An intern can hang off a member, a sub lead or a lead, so this is called from
 * all three places rather than nesting one special case. They are drawn at the
 * deepest indent everywhere, because "trainee" is what the level means — not
 * "seniority relative to the person above me".
 */
export function internRowsHTML(parentId) {
  const interns = (state.pentesters || []).filter(
    (p) => p.subrole === 'Intern' && Number(p.parentId) === Number(parentId)
  );
  if (!interns.length) return '';
  return `<div class="intern-rows">${interns.map((i) => internRowHTML(i)).join('')}</div>`;
}


/** How many projects an intern is currently attached to (a member row shows the same). */
export function internProjectCount(id) {
  return (state.projects || []).filter((p) =>
    (p.pentesters || []).some((pp) => Number(pp.id) === Number(id))
  ).length;
}


export function internRowHTML(i) {
  return `
    <div class="member-row is-intern" data-member="${i.id}">
      <span class="tree-rail"></span>
      ${avatar(i.name, 'sm', i.id)}
      <strong>${h(i.name)}</strong>
      ${subroleBadge('Intern')}
      ${contactHTML(i, 'mr-contact')}
      <span class="spacer"></span>
      <span class="mr-meta">${internProjectCount(i.id)} project${internProjectCount(i.id) === 1 ? '' : 's'}</span>
      <button class="btn btn-icon" data-pent-edit="${i.id}" aria-label="Edit ${h(i.name)}">${icon.edit()}</button>
      <button class="btn btn-icon" data-pent-del="${i.id}" aria-label="Remove ${h(i.name)}">${icon.trash()}</button>
    </div>`;
}


/** "+ Intern", with the parent already chosen — one click, no picker to fight. */
export function addInternBtn(parentId, cls = 'btn btn-sm') {
  return `<button class="${cls}" data-pent-add="Intern" data-parent="${parentId}">${icon.plus()} Intern</button>`;
}


export function leadNodeHTML(lead) {
  const kids = lead.children || [];
  // A member may hang off a sub lead or off the lead directly, so both places have
  // to be drawn — "where are my people" must not depend on how deep they sit.
  const subLeads = kids.filter((c) => c.subrole === 'Sub Lead');
  const directMembers = kids.filter((c) => c.subrole === 'Member');
  const ownInterns = kids.filter((c) => c.subrole === 'Intern');
  const nestedMembers = subLeads.flatMap((sl) =>
    (sl.children || []).filter((c) => c.subrole === 'Member')
  );
  const memberCount = nestedMembers.length + directMembers.length;
  const memberBlock = (list) =>
    `<div class="ts-members">${list.map((m) => memberRowHTML(m) + internRowsHTML(m.id)).join('')}</div>`;

  return `
    <section class="tree-lead" data-lead="${lead.id}">
      <header class="tree-head">
        <div class="th-avatar">${avatar(lead.name, '', lead.id)}</div>
        <div class="th-title">
          <strong>${h(lead.name)}</strong>
          <span>${subroleBadge('Lead')}<em>${subLeads.length} sub lead${subLeads.length === 1 ? '' : 's'} · ${memberCount} member${memberCount === 1 ? '' : 's'}${
            ownInterns.length
              ? ` · ${ownInterns.length} intern${ownInterns.length === 1 ? '' : 's'}`
              : ''
          }</em></span>
          ${contactHTML(lead)}
        </div>
        <span class="spacer"></span>
        <div class="th-actions">
          <button class="btn btn-sm" data-pent-add="Sub Lead" data-parent="${lead.id}">${icon.plus()} Sub lead</button>
          <button class="btn btn-sm" data-pent-add="Member" data-parent="${lead.id}">${icon.plus()} Member</button>
          ${addInternBtn(lead.id)}
          <button class="btn btn-icon" data-pent-edit="${lead.id}" aria-label="Edit ${h(lead.name)}">${icon.edit()}</button>
          <button class="btn btn-icon" data-pent-del="${lead.id}" aria-label="Remove ${h(lead.name)}">${icon.trash()}</button>
        </div>
      </header>
      ${internRowsHTML(lead.id)}
      ${directMembers.length ? memberBlock(directMembers) : ''}
      ${
        subLeads.length
          ? `<div class="tree-body">${subLeads.map((sl) => subLeadNodeHTML(sl)).join('')}</div>`
          : `<div class="tree-empty">${
              directMembers.length
                ? 'No sub leads under ' + h(lead.name) + ' yet.'
                : 'No sub leads or members under ' + h(lead.name) + ' yet.'
            }</div>`
      }
    </section>`;
}


export function subLeadNodeHTML(sl) {
  // Children include interns of this sub lead; those are drawn by internRowsHTML so
  // the member count stays a count of members.
  const kids = sl.children || [];
  const members = kids.filter((m) => m.subrole !== 'Intern');
  return `
    <div class="tree-sub" data-sub="${sl.id}">
      <div class="ts-head">
        <span class="tree-rail"></span>
        <div class="th-avatar sm">${avatar(sl.name, '', sl.id)}</div>
        <div class="th-title">
          <strong>${h(sl.name)}</strong>
          <span>${subroleBadge('Sub Lead')}<em>${members.length} member${members.length === 1 ? '' : 's'}</em></span>
          ${contactHTML(sl)}
        </div>
        <span class="spacer"></span>
        <div class="th-actions">
          <button class="btn btn-sm" data-pent-add="Member" data-parent="${sl.id}">${icon.plus()} Member</button>
          ${addInternBtn(sl.id)}
          <button class="btn btn-icon" data-pent-edit="${sl.id}" aria-label="Edit ${h(sl.name)}">${icon.edit()}</button>
          <button class="btn btn-icon" data-pent-del="${sl.id}" aria-label="Remove ${h(sl.name)}">${icon.trash()}</button>
        </div>
      </div>
      ${
        members.length
          ? `<div class="ts-members">${members
              .map((m) => memberRowHTML(m) + internRowsHTML(m.id))
              .join('')}</div>${internRowsHTML(sl.id)}`
          : `<div class="ts-members empty-row">No members yet under ${h(sl.name)}.</div>${internRowsHTML(sl.id)}`
      }
    </div>`;
}


export function memberRowHTML(m) {
  const assigned = state.projects.filter((p) =>
    (p.pentesters || []).some((pp) => Number(pp.id) === Number(m.id))
  ).length;
  return `
    <div class="member-row" data-member="${m.id}">
      <span class="tree-rail"></span>
      ${avatar(m.name, 'sm', m.id)}
      <strong>${h(m.name)}</strong>
      ${subroleBadge('Member')}
      ${contactHTML(m, 'mr-contact')}
      <span class="spacer"></span>
      <span class="mr-meta">${assigned} project${assigned === 1 ? '' : 's'}</span>
      ${addInternBtn(m.id, 'btn btn-sm mr-add-intern')}
      <button class="btn btn-icon" data-pent-edit="${m.id}" aria-label="Edit ${h(m.name)}">${icon.edit()}</button>
      <button class="btn btn-icon" data-pent-del="${m.id}" aria-label="Remove ${h(m.name)}">${icon.trash()}</button>
    </div>`;
}


export function supervisorCardHTML(m) {
  // Every client that names this person as a default SV, plus every project
  // they actually own. Both matter: defaults drive auto-assignment, owned
  // projects are the current workload.
  const defaults = (state.clients || []).filter((c) =>
    (c.supervisors || []).some((x) => Number(x.id) === Number(m.id))
  );
  const owned = (state.projects || []).filter((p) => Number(p.supervisorId) === Number(m.id));
  const openOwned = owned.filter((p) => p.status !== 'Done');

  return `
    <div class="client-card sv-card" data-supervisor="${m.id}">
      <div class="client-card-head">
        <div class="cc-avatar sv-avatar">${h(initials(m.name))}</div>
        <div class="cc-title">
          <h3>${h(m.name)}</h3>
          <div class="cc-meta">
            <span class="tag">Project manager</span>
            <span>${owned.length} project${owned.length === 1 ? '' : 's'}${openOwned.length ? ` · ${openOwned.length} open` : ''}</span>
          </div>
        </div>
        <div class="cc-actions">
          <button class="btn btn-icon" data-supervisor-edit="${m.id}" aria-label="Edit ${h(m.name)}">${icon.edit()}</button>
          <button class="btn btn-icon danger" data-supervisor-del="${m.id}" aria-label="Delete ${h(m.name)}">${icon.trash()}</button>
        </div>
      </div>

      <div class="sv-contacts">
        ${
          m.phone || m.email
            ? contactLine(m.phone, m.email)
            : '<span class="sv-no-contact">No contact details yet</span>'
        }
      </div>

      <div class="sv-clients">
        <div class="sv-block-label">Default SV for</div>
        ${
          defaults.length
            ? `<div class="sv-chips">${defaults
                .map((c) => `<span class="sv-chip">${icon.building(11)}${h(c.name)}</span>`)
                .join('')}</div>`
            : '<span class="sv-no-contact">No client assigned yet</span>'
        }
      </div>
    </div>`;
}


export function bindUsers() {
  const content = document.getElementById('content');
  if (content) {
    bindSegmented(content, 'users-tab', (label) => {
      const hit = USER_TABS.find((t) => t.label === label);
      state.usersTab = hit ? hit.id : 'all';
      mountContent();
    });
    // The tree's avatars open the person card, the same as an avatar on a project
    // card. Bound on the page container, which is rebuilt on every render, so the
    // listener never stacks up the way one on the stable `#content` would.
    content.querySelector('.admin')?.addEventListener('click', (ev) => {
      const face = ev.target.closest('[data-person]');
      if (!face) return;
      ev.preventDefault();
      ev.stopPropagation();
      openPerson(Number(face.dataset.person));
    });
  }

  document.querySelectorAll('[data-user-new]').forEach((b) =>
    b.addEventListener('click', () => openUserForm())
  );
  document.querySelectorAll('[data-users-import]').forEach((b) =>
    b.addEventListener('click', () => openUserImport())
  );
  document.querySelectorAll('[data-pent-add]').forEach((b) =>
    b.addEventListener('click', () =>
      openUserForm(null, {
        role: 'Pentester',
        subrole: b.dataset.pentAdd,
        parentId: b.dataset.parent ? Number(b.dataset.parent) : null,
      })
    )
  );
  document.querySelectorAll('[data-pent-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openUserForm(state.pentesters.find((p) => Number(p.id) === Number(b.dataset.pentEdit)))
    )
  );
  document.querySelectorAll('[data-pent-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deletePentester(state.pentesters.find((p) => Number(p.id) === Number(b.dataset.pentDel)))
    )
  );
  document.querySelectorAll('[data-supervisor-add]').forEach((b) =>
    b.addEventListener('click', () => openUserForm(null, { role: PM_ROLE }))
  );
  document.querySelectorAll('[data-supervisor-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      openUserForm(state.supervisors.find((m) => Number(m.id) === Number(b.dataset.supervisorEdit)))
    )
  );
  document.querySelectorAll('[data-supervisor-del]').forEach((b) =>
    b.addEventListener('click', () =>
      deleteSupervisor(state.supervisors.find((m) => Number(m.id) === Number(b.dataset.supervisorDel)))
    )
  );
}


/**
 * A person's phone and e-mail, as one line on their row.
 *
 * The contact details were already editable in the user form and readable on the
 * supervisor cards, but a pentester's row showed nothing at all — so the fields
 * were impossible to find from the list and looked like they did not exist. The title
 * attribute carries the whole pair, because a row is one line and a long address has
 * to end in an ellipsis rather than push the buttons off it.
 */
export function contactHTML(person, cls = 'th-contact') {
  if (!person?.phone && !person?.email) return '';
  const full = [person.phone, person.email].filter(Boolean).join(' · ');
  return `<span class="${cls}" title="${h(full)}">${contactLine(person.phone, person.email)}</span>`;
}


/** Which levels each level may report to — the same table the server enforces. */
export const PARENT_LEVELS = {
  'Sub Lead': ['Lead'],
  // A member answers to whoever runs their work: the sub lead on a big team, the
  // lead directly on a small one.
  Member: ['Sub Lead', 'Lead'],
  Intern: ['Member', 'Sub Lead', 'Lead'],
};


/** "a member, a sub lead or a lead" — used in both the hint and the placeholder. */
export function parentPhrase(subrole) {
  const names = (PARENT_LEVELS[subrole] || []).map((s) => s.toLowerCase());
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}


/** What a level means, in the form's own words. */
export function levelHint(subrole) {
  if (subrole === 'Lead') return 'A lead sits at the top of the tree and reports to nobody.';
  if (subrole === 'Sub Lead') return 'A sub lead reports to a lead.';
  if (subrole === 'Intern') {
    return 'An intern reports to a member, a sub lead or a lead, and gets their own table on Team status.';
  }
  return 'A member reports to a sub lead, or to the lead directly on a small team.';
}


/**
 * The "Reports to" control for a level: a select of legal parents, or a callout
 * when no legal parent exists yet. One function for the form and for the level
 * switch, because two hand-built copies of this drifted apart once already.
 */
export function parentPickerHTML(subrole, selectedId = null) {
  const expected = parentPhrase(subrole);
  const choices = managerChoices(subrole, selectedId);
  if (!choices.length) {
    return `<div class="callout"><span>No ${expected} exists yet. Create one before adding a ${subrole.toLowerCase()}.</span></div>`;
  }
  return `<select class="select" id="uf-parent">
      <option value="">Select a ${expected}…</option>
      ${choices
        .map((m) => `<option value="${m.value}" ${m.selected ? 'selected' : ''}>${h(m.label)}</option>`)
        .join('')}
    </select>`;
}


/**
 * Create or edit one person.
 *
 * One form for both roles: the role switch reveals the fields that role actually
 * owns (a level and a reporting line, or client-facing contact details), so there
 * is a single place to add "someone who works here" instead of two that must be
 * chosen between before typing anything.
 *
 * Editing keeps the account's own role. The two PATCH endpoints validate different
 * fields, and turning a lead into a supervisor would leave their reports in a
 * tree with no branch above them.
 */
export function openUserForm(person = null, preset = {}) {
  const editing = Boolean(person);
  const role = editing
    ? person.role === 'Admin'
      ? 'Admin'
      : person.role === PM_ROLE
        ? PM_ROLE
        : 'Pentester'
    : preset.role === PM_ROLE
      ? PM_ROLE
      : 'Pentester';
  const subrole = person?.subrole || preset.subrole || 'Member';
  const parentId = person ? person.parentId : preset.parentId ?? null;
  const isSupervisorRole = role === PM_ROLE;

  openModal({
    title: editing ? `Edit ${person.name}` : 'New user',
    subtitle: editing
      ? isSupervisorRole
        ? 'Project manager — client-facing owner of engagements'
        : 'Update the level or the reporting line'
      : 'Pick the role and the fields follow.',
    body: `
      ${
        editing
          ? ''
          : `<div class="field">
               <label class="label">Role</label>
               ${segmented('uf-role', ['Pentester', PM_ROLE], role)}
               <span class="form-hint">A pentester joins the reporting tree; a project manager owns engagements.</span>
             </div>`
      }
      <div class="field">
        <label class="label" for="uf-name">Full name</label>
        <input class="input" id="uf-name" placeholder="e.g. Rafi Pratama" value="${h(person?.name || '')}" />
      </div>
      ${
        editing
          ? ''
          : `<div class="form-row">
               <div class="field">
                 <label class="label" for="uf-username">Username</label>
                 <input class="input" id="uf-username" placeholder="e.g. rafi" autocomplete="off" />
                 <span class="form-hint">3-32 chars: a-z 0-9 . _ -</span>
               </div>
               <div class="field">
                 <label class="label" for="uf-password">Temporary password</label>
                 <input class="input" id="uf-password" type="text" value="${
                  isSupervisorRole ? 'manager123' : 'pentester123'
                }" />
                 <span class="form-hint">They can change it later. Minimum 6 characters.</span>
               </div>
             </div>`
      }
      <div id="uf-pent" ${isSupervisorRole ? 'hidden' : ''}>
        <div class="field">
          <label class="label">Level</label>
          ${segmented('uf-subrole', ENUMS.subrole, subrole, {
            Lead: 'violet',
            'Sub Lead': 'blue',
            Member: 'slate',
            Intern: 'cyan',
          })}
          <span class="form-hint" id="uf-level-hint">${levelHint(subrole)}</span>
        </div>
        <div class="field" id="uf-parent-row" ${subrole === 'Lead' ? 'hidden' : ''}>
          <label class="label">Reports to</label>
          <div id="uf-parent-host">${subrole === 'Lead' ? '' : parentPickerHTML(subrole, parentId)}</div>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label class="label" for="uf-phone">Contact number</label>
          <input class="input" id="uf-phone" placeholder="+62 812 0000 0000" value="${h(person?.phone || '')}" />
        </div>
        <div class="field">
          <label class="label" for="uf-email">Email</label>
          <input class="input" id="uf-email" type="email" placeholder="name@company.id" value="${h(person?.email || '')}" />
        </div>
      </div>`,
    footer: `<span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create user'}</button>`,
    onMount: (modal, close) => {
      const passInput = modal.querySelector('#uf-password');
      let passTouched = false;
      passInput?.addEventListener('input', () => {
        passTouched = true;
      });

      // Switching role swaps which half of the form is real. The password default
      // follows the role too — but only while the field still holds a default, so a
      // typed password is never overwritten under the user's hands.
      bindSegmented(modal, 'uf-role', (value) => {
        const pm = value === PM_ROLE;
        modal.querySelector('#uf-pent').hidden = pm;
        if (passInput && !passTouched) passInput.value = pm ? 'manager123' : 'pentester123';
      });

      // Switching level rebuilds the parent control: a lead has no parent, and the
      // legal parents for a sub lead are leads, not sub leads.
      bindSegmented(modal, 'uf-subrole', (value) => {
        const row = modal.querySelector('#uf-parent-row');
        modal.querySelector('#uf-level-hint').textContent = levelHint(value);
        row.hidden = value === 'Lead';
        modal.querySelector('#uf-parent-host').innerHTML =
          value === 'Lead' ? '' : parentPickerHTML(value, null);
      });

      modal.querySelector('[data-cancel]').addEventListener('click', close);
      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const name = modal.querySelector('#uf-name').value.trim();
        if (!name) {
          toast('Name is required', 'err');
          modal.querySelector('#uf-name').focus();
          return;
        }
        const phone = modal.querySelector('#uf-phone').value.trim();
        const email = modal.querySelector('#uf-email').value.trim();
        if (email && !EMAIL_RE.test(email)) {
          toast('That email address looks wrong', 'err');
          return;
        }

        const roleNow = editing ? role : segmentedValue(modal, 'uf-role');
        const payload = { name, phone, email };
        if (roleNow !== PM_ROLE) {
          const level = segmentedValue(modal, 'uf-subrole');
          payload.subrole = level;
          if (level === 'Lead') {
            payload.parentId = null;
          } else {
            const sel = modal.querySelector('#uf-parent');
            if (!sel || !sel.value) {
              toast(`Choose which ${parentPhrase(level)} they report to`, 'err');
              return;
            }
            payload.parentId = Number(sel.value);
          }
        }

        const btn = modal.querySelector('[data-save]');
        btn.disabled = true;
        try {
          if (editing) {
            if (roleNow === PM_ROLE) await api.updateSupervisor(person.id, payload);
            else await api.updatePentester(person.id, payload);
            toast('User updated');
          } else {
            const username = modal.querySelector('#uf-username').value.trim();
            const password = modal.querySelector('#uf-password').value;
            if (!username) throw new Error('Username is required');
            if (roleNow === PM_ROLE) await api.createSupervisor({ ...payload, username, password });
            else await api.createPentester({ ...payload, username, password });
            toast(`${name} added`);
          }
          close();
          await refreshUsers();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      });
    },
  });
}


export async function deletePentester(person) {
  if (!person) return;
  const ok = await confirmDialog({
    title: `Remove ${person.name}?`,
    message: `Their account and session are deleted. Projects they are assigned to stay in place, but lose this pentester.`,
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deletePentester(person.id);
    toast('Pentester removed');
    await refreshUsers();
  } catch (err) {
    toast(err.message, 'err');
  }
}


export async function deleteSupervisor(supervisor) {
  if (!supervisor) return;
  const owned = (state.projects || []).filter((p) => Number(p.supervisorId) === Number(supervisor.id));
  const ok = await confirmDialog({
    title: 'Delete project manager?',
    message: owned.length
      ? `${supervisor.name} still owns ${owned.length} project(s). Reassign them first — the server will refuse this.`
      : `${supervisor.name} will lose access. Projects they don't own are unaffected.`,
    confirmLabel: 'Delete project manager',
  });
  if (!ok) return;
  try {
    await api.deleteSupervisor(supervisor.id);
    toast('Project manager deleted');
    await refreshUsers();
  } catch (err) {
    toast(err.message, 'err');
  }
}


/**
 * Reload everything the page shows and repaint the shell.
 *
 * One refresh for both roles: the sidebar count, the tree and the supervisor cards all
 * read from these arrays, and keeping two refreshers is how the two pages drifted
 * into different copy for the same account.
 */
export async function refreshUsers() {
  const [treeRes, supervisorsRes, stats, clientsRes, projectsRes] = await Promise.all([
    api.pentesters(),
    api.supervisors(),
    api.stats(),
    api.clients(),
    api.projects(currentQuery()),
  ]);
  state.pentesters = treeRes.pentesters;
  state.pentesterTree = treeRes.tree;
  state.supervisors = supervisorsRes.supervisors;
  state.stats = stats;
  state.clients = clientsRes.clients;
  state.projects = projectsRes.projects;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.outerHTML = sidebarHTML();
  bindSidebar();
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.nav));
  mountContent();
}


/**
 * Everyone who can legally supervise a given level.
 *
 * A level's legal parents are a SET, not one level: an intern is attached to
 * whoever actually supervises them — usually a member, often the lead on a small
 * team. The label carries the level too, since "Rafi Pratama" and "Rafi Pratama
 * (lead)" are the same name but a different choice when two people share one.
 */
export function managerChoices(subrole, currentParentId = null) {
  const allowed = PARENT_LEVELS[subrole];
  if (!allowed?.length) return [];
  return sortPentesters(state.pentesters)
    .filter((u) => allowed.includes(u.subrole || 'Member'))
    .map((u) => ({
      value: u.id,
      label: allowed.length > 1 ? `${u.name} · ${u.subrole.toLowerCase()}` : u.name,
      sub: u.subrole,
      selected: Number(u.id) === Number(currentParentId),
    }));
}


/* ============================================================
   Importing users
   ------------------------------------------------------------
   A team arrives as a spreadsheet, a WhatsApp list or a CSV export,
   not one modal at a time. The import takes whatever is pasted or
   uploaded, shows exactly what it parsed BEFORE writing anything,
   and then creates the rows one request at a time so a single bad
   line cannot take the other nineteen down with it.
   ============================================================ */
export const IMPORT_LEVELS = {
  lead: 'Lead',
  'sub lead': 'Sub Lead',
  sublead: 'Sub Lead',
  'sub-lead': 'Sub Lead',
  sub_lead: 'Sub Lead',
  member: 'Member',
  staff: 'Member',
  // An intern row in a pasted list is the same "magang" people write in a
  // spreadsheet, so both spellings are accepted.
  intern: 'Intern',
  trainee: 'Intern',
  magang: 'Intern',
};

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;


/** One pasted line -> its cells. Comma, semicolon or tab separated. */
export function splitImportLine(line) {
  return line
    .split(/\t|\s*;\s*|\s*,\s*/)
    .map((v) => v.replace(/^"(.*)"$/, '$1').trim());
}


/** `Rafi Pratama` -> `rafi.pratama`, the username we hand out when none is given. */
export function usernameFor(name) {
  const base = String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);
  if (base.length >= 3) return base;
  return `user.${base}`.slice(0, 32);
}


/** First free variant of a username: rafi, rafi.2, rafi.3 … */
export function freeUsername(base, taken) {
  let name = base.slice(0, 32);
  let i = 2;
  while (taken.has(name)) {
    name = `${base.slice(0, 28)}.${i++}`;
  }
  taken.add(name);
  return name;
}


/**
 * Parse the pasted/uploaded list into preview rows.
 *
 * Only the name is required. A level, a phone and an email are recognised by shape
 * wherever they appear after it — `Rafi, Lead`, `Rafi, rafi, pentester123, Lead, Rafi
 * Pratama` and `Rina, +62 812 …, rina@bank.id` are all things people paste. Whatever is
 * left is positional: username, then password, then the role's own column.
 *
 * Parents are resolved HERE, against the existing tree plus the rows above, so the
 * preview can say "reports to Dewi (auto)" before a single account exists.
 */
export function parseImport(text, opts = {}) {
  const isSupervisorRole = opts.role === PM_ROLE;
  const defaultLevel = opts.defaultLevel || 'Member';
  const defaultPassword = opts.password || (isSupervisorRole ? 'manager123' : 'pentester123');

  const taken = new Set(
    [
      ...(state.pentesters || []).map((u) => u.username),
      ...(state.supervisors || []).map((u) => u.username),
      ...(state.users || []).map((u) => u.username),
    ]
      .filter(Boolean)
      .map((u) => String(u).toLowerCase())
  );

  // The pool a row may report to: the people already in the tree, plus the rows
  // created above it in this list.
  const pool = (state.pentesters || []).map((u) => ({ ...u }));
  const rows = [];
  let seenFirst = false;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitImportLine(line);
    if (!seenFirst) {
      seenFirst = true;
      // A spreadsheet export keeps its header row; it is not a person.
      if (/^(full\s*)?name$/i.test(cells[0] || '')) continue;
    }

    const name = cells[0] || '';
    let rest = cells.slice(1);
    let level = defaultLevel;
    // Pull the level out wherever it landed, so a list without usernames still
    // carries its levels.
    const levelAt = rest.findIndex((c) => IMPORT_LEVELS[String(c).toLowerCase()]);
    if (levelAt >= 0) {
      level = IMPORT_LEVELS[String(rest[levelAt]).toLowerCase()];
      rest = rest.filter((_, i) => i !== levelAt);
    }

    let username = '';
    let password = defaultPassword;
    let reportsTo = '';
    let phone = '';
    let email = '';

    // Contact details are recognised by SHAPE, not by column. "Rina, +62 812 …, 
    // rina@bank.id" is what people paste, and reading that as username = the phone
    // number would create an account nobody can log into.
    const emailAt = rest.findIndex((c) => c.includes('@'));
    if (emailAt >= 0) {
      email = rest[emailAt];
      rest = rest.filter((_, i) => i !== emailAt);
    }
    const phoneAt = rest.findIndex((c) => /^\+?[\d][\d\s().-]{5,}$/.test(c));
    if (phoneAt >= 0) {
      phone = rest[phoneAt];
      rest = rest.filter((_, i) => i !== phoneAt);
    }

    // A parent may be named with no username/password columns in front of it —
    // `Dewi, Sub Lead, Rafi Pratama` names a person, not a login. Anything after the
    // username slot that matches somebody in the pool is read as the parent. The
    // first slot is never stolen: `Bagas Nugroho, bagas, pentester123, Member, Dewi`
    // has a username that is also a person's username, and reading it as the parent
    // shifted every remaining column by one.
    if (!isSupervisorRole) {
      const looksLikePerson = (c) =>
        Boolean(c) &&
        pool.some(
          (u) =>
            String(u.name || '').toLowerCase() === c.toLowerCase() ||
            String(u.username || '').toLowerCase() === c.toLowerCase()
        );
      const personAt = rest.findIndex(looksLikePerson);
      const alone = rest.length === 1 && personAt === 0 && !USERNAME_RE.test(rest[0].toLowerCase());
      if (personAt > 0 || alone) {
        reportsTo = rest[personAt];
        rest = rest.filter((_, i) => i !== personAt);
      } else if (rest.length === 1 && /\s/.test(rest[0])) {
        // One leftover cell with a space in it cannot be a username, so it is someone's
        // name. Reading it as the parent turns "that person does not exist" into the
        // error message instead of a baffling "invalid username".
        reportsTo = rest[0];
        rest = [];
      }
    }

    // Whatever is left is positional: Name, Username, Password, then the role's own
    // column (Reports to for a pentester, nothing for a supervisor).
    username = (rest[0] || '').toLowerCase();
    password = rest[1] || defaultPassword;
    if (!isSupervisorRole && !reportsTo) reportsTo = rest[2] || '';

    let error = '';
    if (!name) error = 'Name is required';
    else if (email && !EMAIL_RE.test(email)) error = 'That e-mail address looks wrong';
    else if (username && !USERNAME_RE.test(username)) {
      error = 'Username must be 3-32 chars: a-z 0-9 . _ -';
    } else if (String(password).length < 6) {
      error = 'Password must be at least 6 characters';
    }
    if (!username) username = usernameFor(name);
    username = freeUsername(username, taken);

    // Who this person reports to. Named explicitly, or the nearest legal parent —
    // the last one in the list, so a file written top-down builds its own tree.
    let parent = null;
    let parentNote = '';
    if (!isSupervisorRole && level !== 'Lead' && !error) {
      // Same legal-parent table the form and the server use: an intern may sit under
      // a member, a sub lead or a lead.
      const allowed = PARENT_LEVELS[level] || [];
      const expected = parentPhrase(level);
      if (reportsTo) {
        parent =
          pool.find(
            (u) =>
              String(u.name || '').toLowerCase() === reportsTo.toLowerCase() ||
              String(u.username || '').toLowerCase() === reportsTo.toLowerCase()
          ) || null;
        if (!parent) error = `No one called “${reportsTo}” to report to`;
        else if (!allowed.includes(parent.subrole)) {
          error = `${parent.name} is a ${parent.subrole}, and a ${level} must report to ${expected}`;
          parent = null;
        }
      } else {
        // The last legal parent in the file, so a list written top-down builds its
        // own tree; for an intern that is most often the member above them.
        parent = [...pool].reverse().find((u) => allowed.includes(u.subrole)) || null;
        if (parent) parentNote = 'auto';
        else error = `Nobody to report to — add a ${expected} above this line, or pick another level`;
      }
    }

    const row = {
      raw: line,
      name,
      username,
      password,
      level: isSupervisorRole ? PM_ROLE : level,
      parentName: parent ? parent.name : '',
      parentUsername: parent ? parent.username : '',
      parentNote,
      phone,
      email,
      error,
    };
    rows.push(row);
    if (!error && !isSupervisorRole) {
      pool.push({ id: `new-${rows.length}`, username, name, subrole: level, role: 'Pentester' });
    }
  }

  return rows;
}


/** The parse result as a table: what will be created, and what cannot be. */
export function importPreviewHTML(rows, isSupervisorRole) {
  if (!rows.length) {
    return `<p class="form-hint">Nothing parsed yet — paste a list above or choose a file.</p>`;
  }
  // Contact is ONE column for both roles. Two columns pushed the pentester preview
  // past the dialog's width, and a preview that has to be scrolled sideways is not a
  // preview; the pair reads fine on one line and says what was picked up.
  // No `#` column: the row number is not referenced anywhere in the errors (they name
  // the person), and dropping it is what leaves room for Status to stay on screen
  // instead of hiding behind a horizontal scroll.
  const head = isSupervisorRole
    ? ['Name', 'Username', 'Password', 'Contact', 'Status']
    : ['Name', 'Username', 'Level', 'Reports to', 'Contact', 'Status'];

  const contact = (r) => [r.phone, r.email].filter(Boolean).join(' · ') || '—';

  return `<div class="dev-tablewrap imp-preview">
      <table class="dev-table">
        <thead><tr>${head
          .map((x) => `<th><span class="dev-h-inner"><span class="dev-h-label">${h(x)}</span></span></th>`)
          .join('')}</tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            <td class="dev-name imp-name" title="${h(r.name || '')}">${h(r.name || '—')}</td>
            <td class="dev-mono-cell">${h(r.username || '—')}</td>
            ${
              isSupervisorRole
                ? `<td class="dev-mono-cell">${h(r.password)}</td>`
                : `<td class="dev-mono-cell">${h(r.level)}</td>
                   <td class="dev-mono-cell">${
                     r.parentName ? `${h(r.parentName)}${r.parentNote ? ' (auto)' : ''}` : '—'
                   }</td>`
            }
            <td class="dev-mono-cell imp-contact" title="${h(contact(r))}">${h(contact(r))}</td>
            <td class="dev-notes ${r.error ? 'imp-bad' : 'imp-ok'}">${h(r.error || 'Ready')}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`;
}


/**
 * Import users from a pasted list or a file.
 *
 * Writes happen one row at a time through the same endpoints the single-person form
 * uses, so a duplicate username is a per-row message rather than a failed batch, and
 * the server's validation stays the only validation.
 */
export function openUserImport() {
  openModal({
    title: 'Import users',
    subtitle: 'Paste a list or choose a file — one person per line',
    // The preview is a seven-column table; at the normal modal width every cell
    // wrapped mid-word ("rina.kusum / a"), which is unreadable and hides exactly the
    // thing the preview exists to show.
    xwide: true,
    body: `
      <div class="field">
        <label class="label">Import as</label>
        ${segmented('imp-role', ['Pentesters', 'Project managers'], 'Pentesters')}
      </div>
      <div class="form-row">
        <div class="field" id="imp-level-field">
          <label class="label">Level for rows without one</label>
          ${segmented('imp-level', ENUMS.subrole, 'Member', { Lead: 'violet', 'Sub Lead': 'blue', Member: 'slate' })}
        </div>
        <div class="field">
          <label class="label" for="imp-pass">Default password</label>
          <input class="input" id="imp-pass" value="pentester123" />
          <span class="form-hint">Used for rows that do not name one. Minimum 6 characters.</span>
        </div>
      </div>
      <div class="field">
        <label class="label" for="imp-text">List</label>
        <textarea class="textarea code" id="imp-text" rows="7" spellcheck="false"
          placeholder="Rafi Pratama
Dewi Lestari, dewi, pentester123, Sub Lead, Rafi Pratama
Bagas Nugroho, Lead"></textarea>
        <span class="form-hint" id="imp-hint"></span>
      </div>
      <div class="imp-file-row">
        <input type="file" id="imp-file" accept=".csv,.tsv,.txt,text/plain,text/csv" hidden />
        <button type="button" class="btn btn-sm" data-imp-file>${icon.fileText(13)} Choose a file…</button>
        <span class="form-hint" id="imp-file-name"></span>
      </div>
      <div id="imp-failures"></div>
      <div id="imp-preview"></div>`,
    footer: `<span class="imp-tally" id="imp-tally"></span>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-import disabled>Import</button>`,
    onMount: (modal, close) => {
      const text = modal.querySelector('#imp-text');
      const pass = modal.querySelector('#imp-pass');
      const fileInput = modal.querySelector('#imp-file');
      const failures = modal.querySelector('#imp-failures');
      const preview = modal.querySelector('#imp-preview');
      const tally = modal.querySelector('#imp-tally');
      const go = modal.querySelector('[data-import]');
      const fileName = modal.querySelector('#imp-file-name');
      let passTouched = false;

      pass.addEventListener('input', () => {
        passTouched = true;
      });

      const isSupervisorRole = () => segmentedValue(modal, 'imp-role') === 'Project managers';
      const rowsNow = () =>
        parseImport(text.value, {
          role: isSupervisorRole() ? PM_ROLE : 'Pentester',
          defaultLevel: isSupervisorRole() ? 'Member' : segmentedValue(modal, 'imp-level') || 'Member',
          password: pass.value,
        });

      const render = () => {
        modal.querySelector('#imp-level-field').hidden = isSupervisorRole();
        modal.querySelector('#imp-hint').textContent = isSupervisorRole()
          ? 'One project manager per line. Only the full name is required — a username and password are generated when you leave them out, and phone / email are recognised wherever they sit.'
          : 'One pentester per line. Only the full name is required — a username and password are generated when you leave them out. Put the level (Lead / Sub Lead / Member), who they report to, and their phone / e-mail anywhere after the name.';
        const rows = rowsNow();
        preview.innerHTML = importPreviewHTML(rows, isSupervisorRole());
        const ok = rows.filter((r) => !r.error).length;
        const bad = rows.length - ok;
        tally.textContent = rows.length
          ? `${ok} ready${bad ? `, ${bad} with problems` : ''}`
          : '';
        go.disabled = ok === 0;
        go.textContent = ok ? `Import ${ok} user${ok === 1 ? '' : 's'}` : 'Import';
        if (rows.length) failures.innerHTML = '';
      };

      bindSegmented(modal, 'imp-role', (value) => {
        const pm = value === 'Project managers';
        // The default password follows the role, unless it was typed.
        if (!passTouched) pass.value = pm ? 'manager123' : 'pentester123';
        render();
      });
      bindSegmented(modal, 'imp-level', render);
      text.addEventListener('input', render);
      pass.addEventListener('input', render);

      modal.querySelector('[data-imp-file]').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileName.textContent = file.name;
        text.value = await file.text();
        render();
      });

      modal.querySelector('[data-cancel]').addEventListener('click', close);

      go.addEventListener('click', async () => {
        const pm = isSupervisorRole();
        const rows = rowsNow().filter((r) => !r.error);
        if (!rows.length) return;
        // People created in this run join the pool, so a member further down the
        // list can report to a sub lead created three lines above them.
        const pool = [...(state.pentesters || [])];
        const created = [];
        const failed = [];

        go.disabled = true;
        go.textContent = 'Importing…';
        for (const row of rows) {
          try {
            const payload = {
              name: row.name,
              username: row.username,
              password: row.password,
              phone: row.phone,
              email: row.email,
            };
            if (!pm) {
              payload.subrole = row.level;
              if (row.level === 'Lead') {
                payload.parentId = null;
              } else {
                const parent = pool.find(
                  (u) => String(u.username).toLowerCase() === row.parentUsername.toLowerCase()
                );
                if (!parent) throw new Error('The person they report to is not in the tree yet');
                payload.parentId = parent.id;
              }
            }
            const res = pm ? await api.createSupervisor(payload) : await api.createPentester(payload);
            const person = res.supervisor || res.pentester;
            if (person) pool.push({ ...person, subrole: person.subrole || row.level });
            created.push(row.username);
          } catch (err) {
            failed.push(`${row.name} (${row.username}): ${err.message}`);
          }
        }

        if (created.length) await refreshUsers();
        if (!failed.length) {
          toast(`${created.length} user${created.length === 1 ? '' : 's'} imported`);
          close();
          return;
        }

        // Leave the dialog holding ONLY the lines that did not make it. The ones
        // that did are now accounts on the server, so leaving them in the box would
        // mean a second click creates them again under a suffixed username.
        text.value = rows.filter((r) => failed.some((f) => f.startsWith(`${r.name} (`))).map((r) => r.raw).join('\n');
        toast(`${created.length} imported, ${failed.length} failed`, 'err');
        render();
        failures.innerHTML = `<div class="callout imp-failures">
            <span><strong>${failed.length} could not be created</strong></span>
            <ul>${failed.map((f) => `<li>${h(f)}</li>`).join('')}</ul>
          </div>`;
      });

      render();
    },
  });
}


/* ============================================================
   project form modal
   ============================================================ */
export function pentesterPickerHTML(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  const rows = sortPentesters(state.users);
  return `
    <div class="psearch">
      ${icon.search()}
      <input class="input" id="p-search" placeholder="Search pentester by name…" autocomplete="off" />
    </div>
    <div class="picker" data-picker>
      ${rows
        .map(
          (u) => `<button type="button" class="pick ${selected.has(u.id) ? 'on' : 'off'}"
            data-uid="${u.id}" data-name="${h(u.name.toLowerCase())}" data-sub="${h(u.subrole || 'Member')}">
            ${avatar(u.name)}
            <span class="pick-name">${h(u.name)}</span>
            ${subroleBadge(u.subrole)}
            ${selected.has(u.id) ? `<span data-check>${icon.check()}</span>` : ''}
          </button>`
        )
        .join('')}
    </div>
    <div class="picker-empty" hidden>${icon.search()} No pentester matches that name.</div>`;
}


/**
 * Multi-select of supervisors, used by the client form.
 * Mirrors the pentester picker markup so bindPicker/pickerValues work unchanged.
 */
export function supervisorPickerHTML(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  const rows = state.supervisors || [];
  if (!rows.length) {
    return `<p class="picker-note">Nobody can be named supervisor yet. Add a project manager (or a pentester) under Admin panel → Manage users.</p>`;
  }
  return `
    <div class="psearch">
      ${icon.search()}
      <input class="input" id="p-search" placeholder="Search supervisor by name…" autocomplete="off" />
    </div>
    <div class="picker" data-picker>
      ${rows
        .map(
          (u) => `<button type="button" class="pick ${selected.has(Number(u.id)) ? 'on' : 'off'}"
            data-uid="${u.id}" data-name="${h(u.name.toLowerCase())}"
            data-sub="${h(u.role === PM_ROLE ? 'Project Manager' : 'Pentester')}">
            ${avatar(u.name)}
            <span class="pick-name">${h(u.name)}</span>
            <span class="pick-role">${h(u.role === PM_ROLE ? 'PM' : 'PT')}</span>
            ${selected.has(Number(u.id)) ? `<span data-check>${icon.check()}</span>` : ''}
          </button>`
        )
        .join('')}
    </div>
    <div class="picker-empty" hidden>${icon.search()} No supervisor matches that name.</div>`;
}


export function bindPicker(root) {
  const picker = root.querySelector('[data-picker]');
  if (!picker) return;

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.pick');
    if (!btn) return;
    const on = btn.classList.toggle('on');
    btn.classList.toggle('off', !on);
    if (on) {
      if (!btn.querySelector('[data-check]')) {
        const span = document.createElement('span');
        span.dataset.check = '1';
        span.innerHTML = icon.check();
        btn.appendChild(span);
      }
    } else {
      btn.querySelector('[data-check]')?.remove();
    }
  });

  // Name search filters the list in place; selection survives because the
  // buttons are hidden rather than re-rendered.
  const search = root.querySelector('#p-search');
  const empty = root.querySelector('.picker-empty');
  search?.addEventListener('input', () => {
    const needle = search.value.trim().toLowerCase();
    let shown = 0;
    picker.querySelectorAll('.pick').forEach((btn) => {
      const hit = !needle || btn.dataset.name.includes(needle);
      btn.hidden = !hit;
      if (hit) shown += 1;
    });
    if (empty) empty.hidden = shown > 0;
  });
}


export function pickerValues(root) {
  return [...root.querySelectorAll('.pick.on')].map((b) => Number(b.dataset.uid));
}


/**
 * Pre-select the supervisor when a client is chosen.
 *
 * A client names one or more usual SVs. With exactly one, that is
 * unambiguous and gets selected. With several, the first is used and the hint
 * says so — silently picking one of many without telling the user would look
 * like a bug. Never touches a SV the user already chose by hand.
 */
export function autoPickSupervisor(modal, clientId, hintEl) {
  const box = modal.querySelector('[data-combo="p-supervisor"]');
  if (!box) return;
  const client = clientById(clientId);
  const supervisors = client?.supervisors || [];
  const idInput = box.querySelector('input[type="hidden"], #p-supervisor');
  const current = idInput ? idInput.value : '';

  if (!supervisors.length) {
    if (hintEl) {
      hintEl.innerHTML = client
        ? `${h(client.name)} has no default supervisor yet. Pick one manually or add it in the Admin panel.`
        : 'Owns this engagement. Admins, leads and sub leads can change it.';
      hintEl.classList.toggle('hint-warn', Boolean(client));
    }
    return;
  }

  // Respect a manual choice made earlier in this same form session.
  if (current && current !== String(box.dataset.autoPicked || '')) return;

  const chosen = supervisors[0];
  setComboboxValue(modal, 'p-supervisor', chosen.id);
  box.dataset.autoPicked = String(chosen.id);
  if (hintEl) {
    // One default SV is a fact, so the hint stays quiet. Several is a choice,
    // so it turns into a warning box the user cannot skim past.
    hintEl.innerHTML =
      supervisors.length === 1
        ? `${icon.userCheck(12)} Auto-selected: ${h(chosen.name)} is ${h(client.name)}'s supervisor.`
        : `${icon.alert(12)} Auto-selected ${h(chosen.name)} — ${h(client.name)} has ${supervisors.length} default SVs, change if needed.`;
    hintEl.classList.toggle('hint-warn', supervisors.length > 1);
    hintEl.classList.toggle('hint-auto', supervisors.length === 1);
  }
}
