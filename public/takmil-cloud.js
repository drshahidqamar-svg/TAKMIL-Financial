// ════════════════════════════════════════════════════════════════
// takmil-cloud.js — drop-in bridge between the approved frontend and
// the backend. Loaded with ONE <script> tag added to the HTML, right
// before the closing </body>. It:
//   1. Gates the app behind a login screen.
//   2. Replaces the localStorage save/load with cloud sync (overriding
//      saveToStorage / loadFromStorage / scheduleSave from the app).
//   3. Adds a user menu + (for admins) a team-management panel.
//   4. Enforces read-only mode in the UI for the "viewer" role.
//
// The existing app code is untouched apart from adding this one tag.
// ════════════════════════════════════════════════════════════════
(function () {
  const API = '/api';
  let SESSION = null;          // { id, email, name, role, initials }
  let CURRENT_REV = 0;         // server revision we last loaded/saved
  let CLOUD_READY = false;

  // ── tiny fetch helper (cookie-based auth) ──
  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status, data });
    return data;
  }

  // ─────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────
  function showLogin(message) {
    document.body.style.overflow = 'hidden';
    const wrap = document.createElement('div');
    wrap.id = 'tk-login';
    wrap.innerHTML = `
      <div class="tk-login-card">
        <div class="tk-login-logo">
          <div class="tk-mark">T</div>
          <div><div class="tk-ltitle">TAKMIL</div><div class="tk-lsub">Financial Command Centre</div></div>
        </div>
        <div class="tk-login-h">Sign in to continue</div>
        ${message ? `<div class="tk-login-msg">${message}</div>` : ''}
        <label class="tk-lab">Email</label>
        <input id="tk-email" type="email" autocomplete="username" placeholder="you@takmil.org">
        <label class="tk-lab">Password</label>
        <input id="tk-pass" type="password" autocomplete="current-password" placeholder="••••••••">
        <div id="tk-err" class="tk-err"></div>
        <button id="tk-submit" class="tk-btn-primary">Sign in</button>
        <div class="tk-login-foot">Contact your administrator if you don't have an account.</div>
      </div>`;
    document.body.appendChild(wrap);

    const submit = () => doLogin();
    document.getElementById('tk-submit').onclick = submit;
    wrap.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    document.getElementById('tk-email').focus();
  }

  async function doLogin() {
    const email = document.getElementById('tk-email').value.trim();
    const password = document.getElementById('tk-pass').value;
    const err = document.getElementById('tk-err');
    const btn = document.getElementById('tk-submit');
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      SESSION = r.user;
      document.getElementById('tk-login')?.remove();
      document.body.style.overflow = '';
      await startCloud();
    } catch (e) {
      err.textContent = e.message || 'Login failed';
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CLOUD SYNC — override the app's persistence layer
  // ─────────────────────────────────────────────────────────────
  async function startCloud() {
    // 1. Load the shared model from the server.
    let payload;
    try {
      payload = await api('/model');
    } catch (e) {
      // If the server has no doc yet and the user is an editor, push the
      // app's current in-memory defaults up as the initial model.
      payload = { doc: {}, rev: 0, canWrite: SESSION.role !== 'viewer' };
    }
    CURRENT_REV = payload.rev || 0;

    const hasDoc = payload.doc && Object.keys(payload.doc).length > 0;
    if (hasDoc && typeof window.restoreD === 'function') {
      window.restoreD(payload.doc);
    } else if (!hasDoc && SESSION.role !== 'viewer' && typeof window.serializeD === 'function') {
      // Seed the cloud with the current default model once.
      try {
        const r = await api('/model', { method: 'PUT', body: { doc: window.serializeD(), baseRev: 0 } });
        CURRENT_REV = r.rev;
      } catch {}
    }

    CLOUD_READY = true;
    overridePersistence();
    refreshAppUI();
    injectUserUI();
    applyRolePermissions();
  }

  // Replace the global save/load functions the app defined.
  function overridePersistence() {
    let saveTimer = null;

    // saveToStorage(showToast) — now saves to the cloud.
    window.saveToStorage = function (showToast) {
      if (!CLOUD_READY) return false;
      if (SESSION.role === 'viewer') return false; // viewers never write
      const doc = window.serializeD();
      api('/model', { method: 'PUT', body: { doc, baseRev: CURRENT_REV } })
        .then(r => {
          CURRENT_REV = r.rev;
          setIndicator('saved');
          if (showToast && typeof window.showPersistToast === 'function') window.showPersistToast('✓ Saved to cloud');
        })
        .catch(err => {
          if (err.status === 409) {
            setIndicator('conflict');
            if (typeof window.showPersistToast === 'function')
              window.showPersistToast('⚠ Someone else saved — reload to merge', true);
          } else {
            setIndicator('error');
            if (typeof window.showPersistToast === 'function') window.showPersistToast('⚠ Cloud save failed', true);
          }
        });
      return true;
    };

    // scheduleSave() — debounced cloud save (mirrors the original 1.5s).
    window.scheduleSave = function () {
      if (SESSION.role === 'viewer') return;
      setIndicator('unsaved');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => window.saveToStorage(false), 1500);
    };

    // loadFromStorage() — no-op now; the cloud load already happened.
    window.loadFromStorage = function () { return true; };

    // Pull the latest from the server (used by a "Reload" affordance).
    window.cloudReload = async function () {
      const p = await api('/model');
      CURRENT_REV = p.rev || 0;
      if (typeof window.restoreD === 'function') window.restoreD(p.doc);
      refreshAppUI();
      if (typeof window.showPersistToast === 'function') window.showPersistToast('✓ Reloaded latest from cloud');
    };
  }

  function setIndicator(state) {
    const e = document.getElementById('save-indicator');
    if (!e) return;
    const map = {
      saved:   ['✓ Synced', 'var(--accent)'],
      unsaved: ['● Unsaved', 'var(--amber)'],
      conflict:['⚠ Conflict', 'var(--red)'],
      error:   ['⚠ Sync error', 'var(--red)'],
    };
    const [t, c] = map[state] || map.saved;
    e.textContent = t; e.style.color = c;
  }

  // Re-render everything the app knows how to render after data changes.
  function refreshAppUI() {
    ['renderDashboard', 'updateKPIs', 'updateHRCalcs', 'updateSupplyCalcs',
     'renderHR', 'renderSupply', 'renderSchools', 'renderVersions', 'renderChangelog',
     'updateConvBenchmarks']
      .forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch {} });
    // Re-apply currency mode last so all freshly-rendered values reformat.
    try { if (typeof window.setCurrency === 'function' && window.CUR) window.setCurrency(window.CUR.mode); } catch {}
  }

  // ─────────────────────────────────────────────────────────────
  // USER MENU + ADMIN PANEL
  // ─────────────────────────────────────────────────────────────
  function injectUserUI() {
    const avatar = document.querySelector('.avatar');
    if (avatar) {
      avatar.textContent = SESSION.initials || (SESSION.name || '?').slice(0, 2).toUpperCase();
      avatar.title = `${SESSION.name} · ${SESSION.role}`;
      avatar.style.cursor = 'pointer';
      avatar.onclick = toggleUserMenu;
    }
    const menu = document.createElement('div');
    menu.id = 'tk-usermenu';
    menu.style.display = 'none';
    menu.innerHTML = `
      <div class="tk-um-head">
        <div class="tk-um-name">${SESSION.name}</div>
        <div class="tk-um-email">${SESSION.email}</div>
        <div class="tk-um-role tk-role-${SESSION.role}">${SESSION.role}</div>
      </div>
      <button class="tk-um-item" data-act="reload"><i class="ti ti-cloud-download"></i> Reload from cloud</button>
      <button class="tk-um-item" data-act="password"><i class="ti ti-key"></i> Change password</button>
      ${SESSION.role === 'admin' ? '<button class="tk-um-item" data-act="team"><i class="ti ti-users"></i> Manage team</button>' : ''}
      <div class="tk-um-div"></div>
      <button class="tk-um-item tk-um-danger" data-act="logout"><i class="ti ti-logout"></i> Sign out</button>`;
    document.body.appendChild(menu);
    menu.querySelectorAll('.tk-um-item').forEach(b => {
      b.onclick = () => { menu.style.display = 'none'; handleMenu(b.dataset.act); };
    });
    document.addEventListener('click', e => {
      if (!menu.contains(e.target) && !e.target.closest('.avatar')) menu.style.display = 'none';
    });
  }

  function toggleUserMenu(e) {
    e.stopPropagation();
    const m = document.getElementById('tk-usermenu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
  }

  async function handleMenu(act) {
    if (act === 'logout') { await api('/auth/logout', { method: 'POST' }).catch(() => {}); location.reload(); }
    if (act === 'reload') { try { await window.cloudReload(); } catch (e) { alert(e.message); } }
    if (act === 'password') showPasswordModal();
    if (act === 'team') showTeamPanel();
  }

  function showPasswordModal() {
    const cur = prompt('Current password:'); if (cur === null) return;
    const nw = prompt('New password (min 8 chars):'); if (nw === null) return;
    api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: nw } })
      .then(() => alert('Password changed.'))
      .catch(e => alert(e.message));
  }

  async function showTeamPanel() {
    let data;
    try { data = await api('/users'); } catch (e) { alert(e.message); return; }
    const ov = document.createElement('div');
    ov.className = 'tk-modal-bg';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const rows = data.users.map(u => `
      <tr>
        <td>${u.name}<div class="tk-muted">${u.email}</div></td>
        <td>
          <select data-uid="${u.id}" class="tk-role-sel">
            ${['admin', 'editor', 'viewer'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </td>
        <td>${u.active ? '<span class="tk-on">active</span>' : '<span class="tk-off">disabled</span>'}</td>
        <td>${u.last_login ? u.last_login.replace('T', ' ').slice(0, 16) : '—'}</td>
        <td><button class="tk-mini" data-reset="${u.id}">reset pw</button>
            <button class="tk-mini" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'disable' : 'enable'}</button></td>
      </tr>`).join('');
    ov.innerHTML = `
      <div class="tk-modal">
        <div class="tk-modal-hd"><div>Manage team</div><button class="tk-x">×</button></div>
        <div class="tk-modal-bd">
          <table class="tk-team-tbl">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="tk-new">
            <div class="tk-new-h">Invite a teammate</div>
            <div class="tk-new-row">
              <input id="tk-nn" placeholder="Full name">
              <input id="tk-ne" placeholder="email" type="email">
              <input id="tk-np" placeholder="temp password (8+)" type="text">
              <select id="tk-nr"><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select>
              <button id="tk-ncreate" class="tk-btn-primary">Add</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.tk-x').onclick = () => ov.remove();

    ov.querySelectorAll('.tk-role-sel').forEach(s => {
      s.onchange = () => api(`/users/${s.dataset.uid}`, { method: 'PATCH', body: { role: s.value } })
        .catch(e => { alert(e.message); s.value = data.users.find(u => u.id == s.dataset.uid).role; });
    });
    ov.querySelectorAll('[data-reset]').forEach(b => {
      b.onclick = () => { const p = prompt('New password (min 8):'); if (p) api(`/users/${b.dataset.reset}/reset-password`, { method: 'POST', body: { newPassword: p } }).then(() => alert('Reset.')).catch(e => alert(e.message)); };
    });
    ov.querySelectorAll('[data-toggle]').forEach(b => {
      b.onclick = () => api(`/users/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active === '1' ? false : true } })
        .then(() => { ov.remove(); showTeamPanel(); }).catch(e => alert(e.message));
    });
    ov.querySelector('#tk-ncreate').onclick = () => {
      const body = {
        name: ov.querySelector('#tk-nn').value.trim(),
        email: ov.querySelector('#tk-ne').value.trim(),
        password: ov.querySelector('#tk-np').value,
        role: ov.querySelector('#tk-nr').value,
      };
      api('/users', { method: 'POST', body }).then(() => { ov.remove(); showTeamPanel(); }).catch(e => alert(e.message));
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ROLE PERMISSIONS — lock the UI down for viewers
  // ─────────────────────────────────────────────────────────────
  function applyRolePermissions() {
    if (SESSION.role !== 'viewer') return;
    const style = document.createElement('style');
    style.textContent = `
      /* Viewer: disable inputs and editing controls, keep everything readable */
      .main input:not([type=range]), .main select, .main textarea { pointer-events:none; opacity:.85; }
      .main input[type=range] { pointer-events:none; }
      .c-btn.primary, .c-btn.danger, [onclick*="save"], [onclick*="add"],
      [onclick*="Add"], [onclick*="delete"], [onclick*="Delete"], [onclick*="remove"] { display:none !important; }
    `;
    document.head.appendChild(style);
    const badge = document.createElement('div');
    badge.className = 'tk-viewbadge';
    badge.innerHTML = '<i class="ti ti-eye"></i> View only';
    document.querySelector('.topbar')?.insertBefore(badge, document.querySelector('.avatar'));
  }

  // ─────────────────────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
    #tk-login{position:fixed;inset:0;z-index:99999;background:var(--bg,#0a0e1a);display:flex;align-items:center;justify-content:center}
    .tk-login-card{width:340px;background:var(--bg2,#111827);border:.5px solid var(--border2,rgba(255,255,255,.12));border-radius:14px;padding:28px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .tk-login-logo{display:flex;align-items:center;gap:10px;margin-bottom:22px}
    .tk-mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#10b981,#0d9488);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px}
    .tk-ltitle{font-size:15px;font-weight:700;color:var(--text,#f1f5f9);letter-spacing:-.3px}
    .tk-lsub{font-size:10px;color:var(--text3,#94a3b8)}
    .tk-login-h{font-size:13px;color:var(--text2,#e2e8f0);margin-bottom:14px;font-weight:500}
    .tk-login-msg{font-size:11px;color:#f59e0b;background:rgba(245,158,11,.1);padding:8px 10px;border-radius:7px;margin-bottom:12px}
    .tk-lab{display:block;font-size:10px;font-weight:600;color:var(--text3,#94a3b8);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.5px}
    #tk-login input{width:100%;background:var(--bg3,#1a2236);border:.5px solid var(--border2,rgba(255,255,255,.12));border-radius:7px;color:var(--text,#f1f5f9);padding:9px 11px;font-size:13px;outline:none}
    #tk-login input:focus{border-color:#10b981}
    .tk-err{color:#ef4444;font-size:11px;min-height:14px;margin:8px 0 4px}
    .tk-btn-primary{width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;margin-top:6px}
    .tk-btn-primary:hover{filter:brightness(1.08)} .tk-btn-primary:disabled{opacity:.6;cursor:default}
    .tk-login-foot{font-size:10px;color:var(--text3,#94a3b8);text-align:center;margin-top:16px}

    #tk-usermenu{position:fixed;top:50px;right:16px;width:230px;background:var(--bg2,#111827);border:.5px solid var(--border2,rgba(255,255,255,.12));border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.5);z-index:9999;overflow:hidden;animation:slideUp .15s ease}
    .tk-um-head{padding:12px 14px;border-bottom:.5px solid var(--border,rgba(255,255,255,.07))}
    .tk-um-name{font-size:13px;font-weight:600;color:var(--text,#f1f5f9)}
    .tk-um-email{font-size:10px;color:var(--text3,#94a3b8);margin-top:1px}
    .tk-um-role{display:inline-block;margin-top:6px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 7px;border-radius:10px}
    .tk-role-admin{background:rgba(139,92,246,.15);color:#8b5cf6}.tk-role-editor{background:rgba(16,185,129,.15);color:#10b981}.tk-role-viewer{background:rgba(59,130,246,.15);color:#3b82f6}
    .tk-um-item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;color:var(--text2,#e2e8f0);padding:9px 14px;font-size:12px;cursor:pointer}
    .tk-um-item:hover{background:var(--bg3,#1a2236)} .tk-um-item i{font-size:15px;color:var(--text3,#94a3b8)}
    .tk-um-danger{color:#ef4444}.tk-um-danger i{color:#ef4444}
    .tk-um-div{height:.5px;background:var(--border,rgba(255,255,255,.07))}

    .tk-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center}
    .tk-modal{width:680px;max-width:94vw;max-height:90vh;overflow:auto;background:var(--bg2,#111827);border:.5px solid var(--border2,rgba(255,255,255,.12));border-radius:12px}
    .tk-modal-hd{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:.5px solid var(--border,rgba(255,255,255,.07));font-size:14px;font-weight:600;color:var(--text,#f1f5f9)}
    .tk-x{background:none;border:none;color:var(--text2,#e2e8f0);font-size:22px;cursor:pointer;line-height:1}
    .tk-modal-bd{padding:18px}
    .tk-team-tbl{width:100%;border-collapse:collapse;font-size:12px}
    .tk-team-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3,#94a3b8);padding:6px 8px;border-bottom:.5px solid var(--border,rgba(255,255,255,.07))}
    .tk-team-tbl td{padding:9px 8px;border-bottom:.5px solid var(--border,rgba(255,255,255,.07));color:var(--text2,#e2e8f0);vertical-align:middle}
    .tk-muted{font-size:10px;color:var(--text3,#94a3b8)}
    .tk-role-sel{background:var(--bg3,#1a2236);border:.5px solid var(--border2,rgba(255,255,255,.12));color:var(--text,#f1f5f9);border-radius:6px;padding:4px 6px;font-size:11px}
    .tk-on{color:#10b981;font-size:11px}.tk-off{color:#ef4444;font-size:11px}
    .tk-mini{background:var(--bg3,#1a2236);border:.5px solid var(--border2,rgba(255,255,255,.12));color:var(--text2,#e2e8f0);border-radius:5px;padding:3px 8px;font-size:10px;cursor:pointer;margin-right:4px}
    .tk-mini:hover{border-color:#10b981;color:#10b981}
    .tk-new{margin-top:18px;padding-top:14px;border-top:.5px solid var(--border,rgba(255,255,255,.07))}
    .tk-new-h{font-size:11px;font-weight:600;color:var(--text2,#e2e8f0);margin-bottom:8px}
    .tk-new-row{display:flex;gap:6px;flex-wrap:wrap}
    .tk-new-row input,.tk-new-row select{flex:1;min-width:110px;background:var(--bg3,#1a2236);border:.5px solid var(--border2,rgba(255,255,255,.12));color:var(--text,#f1f5f9);border-radius:6px;padding:7px 9px;font-size:11px}
    .tk-new-row .tk-btn-primary{flex:0 0 auto;width:auto;padding:7px 16px;margin:0}
    .tk-viewbadge{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#3b82f6;background:rgba(59,130,246,.12);padding:4px 10px;border-radius:20px;margin-right:6px}
    `;
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────────────────────
  async function boot() {
    injectStyles();
    try {
      const r = await api('/auth/me');
      SESSION = r.user;
      await startCloud();
    } catch {
      showLogin();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
