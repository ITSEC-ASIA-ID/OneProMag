import { boot, presenceTimer } from './shell.js';
import { canManageCatalog, root, state } from './state.js';
import { api } from './api.js';
import { icon } from './icons.js';
import {
  applyTheme, contactLine, escapeHtml as h, openModal,
  subroleBadge, toast,
} from './ui.js';


/* ============================================================
   login view
   ============================================================ */
export function renderAuth(mode = 'login') {
  // The server decides both of these (see /api/auth/me): a production install seeds
  // no demo accounts and closes registration, and the screen it shows must not
  // advertise either. Unknown means no — offering a form that answers 403 is worse
  // than not offering it.
  const canRegister = state.allowRegister === true;
  const showDemo = state.demo === true;
  const isRegister = mode === 'register' && canRegister;
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="brand">
          <div class="brand-mark">${icon.shield(20)}</div>
          <div>
            <div class="brand-name">OneProMag</div>
            <div class="brand-sub">Pentest PM</div>
          </div>
        </div>

        <div class="auth-head">
          <h1>${isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p>${isRegister ? 'Join the pentest workspace.' : 'Sign in to manage your pentest projects.'}</p>
        </div>

        <form class="auth-form" id="auth-form" autocomplete="on">
          ${
            isRegister
              ? `<div class="field">
                   <label for="name">Full name</label>
                   <input class="input" id="name" name="name" placeholder="e.g. Rafi Pratama" required />
                 </div>`
              : ''
          }
          <div class="field">
            <label for="username">${isRegister ? 'Username' : 'Username or email'}</label>
            <input class="input" id="username" name="username"
                   placeholder="${isRegister ? 'your.username' : 'your.username or you@company.com'}"
                   autocomplete="${isRegister ? 'username' : 'username email'}"
                   autocapitalize="none" spellcheck="false" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="pw-wrap">
              <input class="input" id="password" name="password" type="password" placeholder="Your password"
                     autocomplete="${isRegister ? 'new-password' : 'current-password'}" required />
              <button class="pw-toggle" type="button" data-pw-toggle aria-label="Show password">${icon.eye()}</button>
            </div>
          </div>
          <div class="auth-error" id="auth-error">${icon.alert()}<span></span></div>
          <button class="btn btn-primary auth-submit" type="submit" id="auth-submit">
            ${isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        ${
          canRegister
            ? `<div class="auth-alt">
                 <span>${isRegister ? 'Already have an account?' : 'Need an account?'}</span>
                 <button class="link-btn" id="switch-mode">${isRegister ? 'Sign in' : 'Register'}</button>
               </div>`
            : `<div class="auth-alt auth-alt-note">
                 <span>Accounts are created by an administrator — ask your team lead.</span>
               </div>`
        }

        ${
          isRegister || !showDemo
            ? ''
            : `<div class="demo-box">
                 <p>Demo accounts</p>
                 <div class="demo-row">
                   <span><code>admin</code> / <code>admin123</code> <em>Admin · Lead</em></span>
                   <button class="btn btn-sm" data-fill="admin">Use</button>
                 </div>
                 <div class="demo-row">
                   <span><code>rafi</code> / <code>pentester123</code> <em>Lead</em></span>
                   <button class="btn btn-sm" data-fill="rafi">Use</button>
                 </div>
                 <div class="demo-row">
                   <span><code>dewi</code> / <code>pentester123</code> <em>Sub Lead</em></span>
                   <button class="btn btn-sm" data-fill="dewi">Use</button>
                 </div>
                 <div class="demo-row">
                   <span><code>bagas</code> / <code>pentester123</code> <em>Member</em></span>
                   <button class="btn btn-sm" data-fill="bagas">Use</button>
                 </div>
               </div>`
        }
      </div>
    </div>`;

  const form = document.getElementById('auth-form');
  const errBox = document.getElementById('auth-error');
  const submit = document.getElementById('auth-submit');

  document.getElementById('switch-mode')?.addEventListener('click', () => {
    if (!canRegister) return;
    renderAuth(isRegister ? 'login' : 'register');
  });

  const pw = document.getElementById('password');
  const toggle = form.querySelector('[data-pw-toggle]');
  toggle.addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.innerHTML = show ? icon.eyeOff() : icon.eye();
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  document.querySelectorAll('[data-fill]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('username').value = btn.dataset.fill;
      pw.value = btn.dataset.fill === 'admin' ? 'admin123' : 'pentester123';
      errBox.classList.remove('show');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.remove('show');
    submit.disabled = true;
    submit.textContent = isRegister ? 'Creating…' : 'Signing in…';
    try {
      if (isRegister) {
        const name = document.getElementById('name').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = pw.value;
        // Level is deliberately not self-assigned: the server forces new
        // self-registered accounts to Member, and only an admin can promote.
        const res = await api.register({ name, username, password });
        state.user = res.user;
      } else {
        const res = await api.login(document.getElementById('username').value.trim(), pw.value);
        state.user = res.user;
      }
      await boot();
    } catch (err) {
      errBox.querySelector('span').textContent = err.message;
      errBox.classList.add('show');
      submit.disabled = false;
      submit.textContent = isRegister ? 'Create account' : 'Sign in';
    }
  });
}


export function openAccountMenu() {
  openModal({
    title: state.user.name,
    subtitle: `@${state.user.username}`,
    body: `
      <div class="role-line">
        ${subroleBadge(state.user.subrole || 'Member')}
        <span class="badge badge-outline">${h(state.user.role)}</span>
      </div>
      <div class="hierarchy">
        <div class="hier-row ${state.user.subrole === 'Lead' ? 'on' : ''}"><span class="hier-dot"></span><strong>Lead</strong><span>Owns the engagement, approves scope</span></div>
        <div class="hier-row ${state.user.subrole === 'Sub Lead' ? 'on' : ''}"><span class="hier-dot"></span><strong>Sub Lead</strong><span>Runs the day-to-day testing</span></div>
        <div class="hier-row ${state.user.subrole === 'Member' ? 'on' : ''}"><span class="hier-dot"></span><strong>Member</strong><span>Executes assigned tasks</span></div>
        <div class="hier-row ${state.user.subrole === 'Intern' ? 'on' : ''}"><span class="hier-dot"></span><strong>Intern</strong><span>Tests alongside a supervisor</span></div>
      </div>
      ${
        canManageCatalog()
          ? `<p class="hint mt-14">${icon.check()} You can manage clients and applications in the Admin panel.</p>`
          : ''
      }
      <div class="field mt-14">
        <div class="field-label">Contact</div>
        ${contactLine(state.user.phone, state.user.email) || '<p class="hint">No contact details yet.</p>'}
      </div>
      <div class="field mt-14">
        <div class="field-label">Appearance</div>
        <div class="flex-row">
          <button class="btn flex-1" data-theme-set="light">${icon.sun()} Light</button>
          <button class="btn flex-1" data-theme-set="dark">${icon.moon()} Dark</button>
        </div>
      </div>`,
    footer: `<button class="btn" data-profile>${icon.user(13)} Edit contact</button>
      <button class="btn" data-password>${icon.lock()} Change password</button>
      <div class="spacer"></div>
      <button class="btn btn-danger" data-logout>${icon.logout()} Sign out</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-password]').addEventListener('click', () => {
        close();
        openPasswordForm();
      });
      modal.querySelector('[data-profile]').addEventListener('click', () => {
        close();
        openProfileForm();
      });
      modal.querySelectorAll('[data-theme-set]').forEach((b) =>
        b.addEventListener('click', () => {
          applyTheme(b.dataset.themeSet);
          const tb = document.getElementById('theme-btn');
          if (tb) tb.innerHTML = b.dataset.themeSet === 'dark' ? icon.sun() : icon.moon();
          toast(`Switched to ${b.dataset.themeSet} theme`);
        })
      );
      modal.querySelector('[data-logout]').addEventListener('click', async () => {
        close();
        clearInterval(presenceTimer);
        presenceTimer = null;
        await api.logout();
        state.user = null;
        renderAuth('login');
      });
    },
  });
}


/* ============================================================
   change password
   ============================================================ */
/**
 * Self-service contact details.
 *
 * Only phone and email are editable: name, role, level and reporting line are set
 * by whoever administers the team, and exposing them here would let anyone
 * promote themselves. The form says so rather than leaving the user wondering why
 * their name is not a field.
 */
export function openProfileForm() {
  const u = state.user;
  openModal({
    title: 'Contact details',
    subtitle: 'How teammates reach you. Only you can change these.',
    body: `
      <div class="field mt-0">
        <label for="pf-phone">Phone number</label>
        <input class="input" id="pf-phone" type="tel" autocomplete="tel"
               placeholder="+62 812 3456 7890" value="${h(u.phone || '')}" />
      </div>
      <div class="field">
        <label for="pf-email">Email</label>
        <input class="input" id="pf-email" type="email" autocomplete="email"
               placeholder="you@company.com" value="${h(u.email || '')}" />
        <span class="hint">Your email also works as a login name. If a colleague already
          uses the same address, sign in with your username instead.</span>
      </div>
      <div class="field">
        <div class="field-label">Fixed by an admin</div>
        <div class="hint hint-auto hint-block">
          ${h(u.name)} · @${h(u.username)} · ${h(u.role)} · ${h(u.subrole || 'Member')}
        </div>
      </div>`,
    footer: `<button class="btn" data-cancel>Cancel</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-save>${icon.check()} Save</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-cancel]').addEventListener('click', close);
      const save = modal.querySelector('[data-save]');
      const submit = async () => {
        save.disabled = true;
        try {
          const res = await api.updateProfile({
            phone: modal.querySelector('#pf-phone').value.trim(),
            email: modal.querySelector('#pf-email').value.trim(),
          });
          state.user = { ...state.user, ...res.user };
          close();
          toast('Contact details saved', 'ok');
        } catch (err) {
          toast(err.message, 'err');
          save.disabled = false;
        }
      };
      save.addEventListener('click', submit);
      modal.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') {
          ev.preventDefault();
          submit();
        }
      });
    },
  });
}


export function openPasswordForm() {
  const body = `
    <div class="field mt-0">
      <label for="pw-current">Current password</label>
      <div class="pw-wrap">
        <input class="input" id="pw-current" type="password" autocomplete="current-password"
               placeholder="Your password right now" />
        <button class="pw-toggle" type="button" data-pw-eye="pw-current"
                aria-label="Show password" title="Show password">${icon.eye(16)}</button>
      </div>
    </div>

    <div class="field">
      <label for="pw-new">New password</label>
      <div class="pw-wrap">
        <input class="input" id="pw-new" type="password" autocomplete="new-password"
               placeholder="At least 6 characters" />
        <button class="pw-toggle" type="button" data-pw-eye="pw-new"
                aria-label="Show password" title="Show password">${icon.eye(16)}</button>
      </div>
      <div class="pw-meter" id="pw-meter" aria-hidden="true"><span></span><span></span><span></span></div>
      <span class="hint" id="pw-hint">Use 6+ characters. A longer passphrase beats a short complex one.</span>
    </div>

    <div class="field">
      <label for="pw-confirm">Confirm new password</label>
      <div class="pw-wrap">
        <input class="input" id="pw-confirm" type="password" autocomplete="new-password"
               placeholder="Type the new password again" />
        <button class="pw-toggle" type="button" data-pw-eye="pw-confirm"
                aria-label="Show password" title="Show password">${icon.eye(16)}</button>
      </div>
      <span class="hint hint-err" id="pw-confirm-hint" hidden>Both new passwords must match.</span>
    </div>

    <p class="hint mt-2">${icon.lock(13)} Changing your password signs out every other device.</p>`;

  openModal({
    title: 'Change password',
    subtitle: `@${state.user.username}`,
    initialFocus: '#pw-current',
    body,
    footer: `<div class="spacer"></div>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>Update password</button>`,
    onMount: (modal, close) => {
      const cur = modal.querySelector('#pw-current');
      const next = modal.querySelector('#pw-new');
      const conf = modal.querySelector('#pw-confirm');
      const meter = modal.querySelector('#pw-meter');
      const hint = modal.querySelector('#pw-hint');
      const confHint = modal.querySelector('#pw-confirm-hint');
      const save = modal.querySelector('[data-save]');

      // Reveal/hide, so a long passphrase can be typed without guessing.
      modal.querySelectorAll('[data-pw-eye]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const input = modal.querySelector(`#${btn.dataset.pwEye}`);
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.innerHTML = show ? icon.eyeOff(16) : icon.eye(16);
          btn.title = show ? 'Hide password' : 'Show password';
          btn.setAttribute('aria-label', btn.title);
        })
      );

      // A 3-step length meter. Deliberately no "must contain a symbol" rule:
      // the server only asks for 6+, and lying about the policy in the UI is
      // worse than a simpler policy.
      const strength = (v) => (v.length === 0 ? 0 : v.length < 6 ? 1 : v.length < 10 ? 2 : 3);
      const paint = () => {
        const lvl = strength(next.value);
        meter.dataset.level = String(lvl);
        if (lvl === 0) hint.textContent = 'Use 6+ characters. A longer passphrase beats a short complex one.';
        else if (lvl === 1) hint.textContent = 'Too short — at least 6 characters.';
        else if (lvl === 2) hint.textContent = 'Acceptable. A few more characters would be stronger.';
        else hint.textContent = 'Good length.';
        hint.classList.toggle('hint-err', lvl === 1);
        const mismatch = conf.value.length > 0 && conf.value !== next.value;
        confHint.hidden = !mismatch;
        save.disabled = !currentOk();
      };

      const currentOk = () =>
        cur.value.length > 0 && next.value.length >= 6 && conf.value === next.value;

      [cur, next, conf].forEach((i) => i.addEventListener('input', paint));
      paint();

      modal.querySelector('[data-cancel]').addEventListener('click', close);

      const submit = async () => {
        if (!currentOk()) {
          if (conf.value !== next.value) confHint.hidden = false;
          else if (next.value.length < 6) (next.focus(), paint());
          else cur.focus();
          return;
        }
        save.disabled = true;
        try {
          await api.changePassword(cur.value, next.value);
          close();
          toast('Password updated — other devices were signed out');
        } catch (err) {
          // The server's message says exactly what is wrong; surface it rather
          // than a generic "could not save".
          toast(err.message, 'err');
          save.disabled = false;
          cur.select();
        }
      };
      save.addEventListener('click', submit);
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
    },
  });
}
