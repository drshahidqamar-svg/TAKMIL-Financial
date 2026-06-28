// ════════════════════════════════════════════════════════════════
// takmil-import.js — bulk CSV import for Schools, HR/Staff, Supply items.
//
// Adds an "Import Data" button to the topbar. For each data type you can:
//   1. Download a CSV template (with the current data pre-filled as a
//      starting point, or just headers).
//   2. Upload a filled CSV.
//   3. Preview exactly what will be imported + any row errors.
//   4. Choose Replace all  OR  Append to existing.
//   5. Apply — writes into the model (D.*) and cloud-saves like any edit.
//
// Writes go through the same arrays and render/save functions the app
// already uses, so imports behave identically to manual edits.
// ════════════════════════════════════════════════════════════════
(function () {
  // Only editors/admins should see import. Viewers never write.
  function canImport() {
    // The cloud bridge locks viewers out of writes already; double-guard here.
    return !document.querySelector('.tk-viewbadge');
  }

  // ── Valid enums (from the model) — used to validate & guide ──
  const STATUS = ['Active', 'Inactive', 'Issue', 'Vacant', 'Closed', 'Pending'];
  const SCHOOL_STATUS = ['Active', 'Inactive', 'Closed', 'Pending'];
  const SUPPLY_CAT = ['tech', 'classroom'];

  // ────────────────────────────────────────────────────────────
  // CSV parse / stringify  (RFC-4180-ish: handles quotes, commas, newlines)
  // ────────────────────────────────────────────────────────────
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    // Drop fully-empty trailing rows
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  function toCSV(headers, rows) {
    const esc = v => {
      v = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
    return lines.join('\n');
  }

  function rowsToObjects(rows) {
    if (!rows.length) return { headers: [], objects: [] };
    const headers = rows[0].map(h => h.trim());
    const objects = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = (r[i] !== undefined ? r[i] : '').trim(); });
      return o;
    });
    return { headers, objects };
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // helpers
  const num = (v, d = 0) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d : n; };
  const bool = v => /^(1|true|yes|y)$/i.test(String(v).trim());
  const D = () => window.D;

  // ────────────────────────────────────────────────────────────
  // SCHEMAS — one per data type
  // ────────────────────────────────────────────────────────────
  const SCHEMAS = {
    schools: {
      label: 'Schools',
      arr: () => D().schoolsList,
      headers: ['name', 'village', 'district', 'region', 'type', 'students', 'established',
        'q1Status', 'q2Status', 'q3Status', 'q4Status', 'notes', 'hasSolar', 'prevYearTech'],
      hints: {
        students: 'number', established: 'year e.g. 2022',
        q1Status: SCHOOL_STATUS.join(' / '), hasSolar: 'true/false', prevYearTech: 'true/false',
      },
      // turn a model object into a flat CSV row
      toRow: s => ({
        name: s.name, village: s.village, district: s.district, region: s.region, type: s.type,
        students: s.students, established: s.established || 2022,
        q1Status: s.q1Status || 'Active', q2Status: s.q2Status || 'Active',
        q3Status: s.q3Status || 'Active', q4Status: s.q4Status || 'Active',
        notes: s.notes || '', hasSolar: s.hasSolar !== false, prevYearTech: !!s.prevYearTech,
      }),
      // turn a CSV object into a validated model record (+ errors)
      parse: (o, idx) => {
        const errs = [];
        if (!o.name) errs.push('name is required');
        const st = o.students === '' ? 25 : num(o.students, NaN);
        if (isNaN(st)) errs.push('students must be a number');
        ['q1Status', 'q2Status', 'q3Status', 'q4Status'].forEach(q => {
          if (o[q] && !SCHOOL_STATUS.some(s => s.toLowerCase() === o[q].toLowerCase()))
            errs.push(`${q} "${o[q]}" not one of ${SCHOOL_STATUS.join('/')}`);
        });
        const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : 'Active';
        const rec = {
          name: o.name, village: o.village || '', district: o.district || '',
          region: o.region || '', type: o.type || 'Community',
          students: isNaN(st) ? 25 : st, established: o.established ? num(o.established, 2022) : 2022,
          q1Status: cap(o.q1Status) || 'Active', q2Status: cap(o.q2Status) || 'Active',
          q3Status: cap(o.q3Status) || 'Active', q4Status: cap(o.q4Status) || 'Active',
          q1Reason: '', q2Reason: '', q3Reason: '', q4Reason: '',
          q1Students: isNaN(st) ? 25 : st, q2Students: isNaN(st) ? 25 : st,
          q3Students: isNaN(st) ? 25 : st, q4Students: isNaN(st) ? 25 : st,
          notes: o.notes || '',
          hasSolar: o.hasSolar === '' ? true : bool(o.hasSolar),
          prevYearTech: bool(o.prevYearTech),
          infraOverrides: {}, teacherMon: null, fcoordMon: null,
        };
        return { rec, errs };
      },
      summary: r => `${r.name} · ${r.district || '—'} · ${r.students} students`,
    },

    hr: {
      label: 'HR / Staff',
      arr: () => D().hrList,
      headers: ['name', 'role', 'department', 'status', 'monthlySalary', 'startQuarter', 'endQuarter', 'isFieldCoord', 'isRegionalCoord'],
      hints: {
        department: (window.DEPT_OPTS || ['Management', 'Sustainability', 'Operations', 'Academics', 'Data/LMS', 'Finance', 'Outreach']).join(' / '),
        status: STATUS.join(' / '), monthlySalary: 'number (USD/mo)',
        startQuarter: '1-4', endQuarter: '1-4 or blank', isFieldCoord: 'true/false', isRegionalCoord: 'true/false',
      },
      toRow: h => ({
        name: h.n, role: h.r, department: h.d, status: h.s, monthlySalary: h.mon,
        startQuarter: h.startQ || 1, endQuarter: h.endQ == null ? '' : h.endQ,
        isFieldCoord: !!h.isFC, isRegionalCoord: !!h.isRC,
      }),
      parse: (o) => {
        const errs = [];
        if (!o.name) errs.push('name is required');
        const mon = num(o.monthlySalary, NaN);
        if (isNaN(mon)) errs.push('monthlySalary must be a number');
        const sQ = o.startQuarter ? num(o.startQuarter, 1) : 1;
        if (sQ < 1 || sQ > 4) errs.push('startQuarter must be 1-4');
        const eQ = o.endQuarter === '' ? null : num(o.endQuarter, null);
        if (eQ !== null && (eQ < 1 || eQ > 4)) errs.push('endQuarter must be 1-4 or blank');
        const rec = {
          n: o.name, r: o.role || '', d: o.department || 'Management',
          s: o.status || 'Active', mon: isNaN(mon) ? 0 : mon,
          startQ: sQ, endQ: eQ, isFC: bool(o.isFieldCoord), isRC: bool(o.isRegionalCoord),
        };
        return { rec, errs };
      },
      summary: r => `${r.n} · ${r.r || '—'} · ${r.d} · $${r.mon}/mo${r.isFC ? ' [FC]' : ''}${r.isRC ? ' [RC]' : ''}`,
    },

    supply: {
      label: 'Supply Items',
      arr: () => D().supply,
      headers: ['name', 'unitPrice', 'category', 'formula', 'solarOnly', 'techItem', 'releaseQuarter'],
      hints: {
        unitPrice: 'number (USD)', category: SUPPLY_CAT.join(' / '),
        formula: 'e.g. schools | students | students/bookRatio',
        solarOnly: 'true/false', techItem: 'true/false', releaseQuarter: '1-4',
      },
      toRow: i => ({
        name: i.n, unitPrice: i.up, category: i.cat, formula: i.formula,
        solarOnly: !!i.solarOnly, techItem: !!i.techItem, releaseQuarter: i.releaseQ || 1,
      }),
      parse: (o) => {
        const errs = [];
        if (!o.name) errs.push('name is required');
        const up = num(o.unitPrice, NaN);
        if (isNaN(up)) errs.push('unitPrice must be a number');
        if (o.category && !SUPPLY_CAT.includes(o.category.toLowerCase()))
          errs.push(`category must be ${SUPPLY_CAT.join('/')}`);
        const rQ = o.releaseQuarter ? num(o.releaseQuarter, 1) : 1;
        const rec = {
          n: o.name, up: isNaN(up) ? 0 : up,
          cat: (o.category || 'classroom').toLowerCase(),
          formula: o.formula || 'schools', qtyOvr: false,
          solarOnly: bool(o.solarOnly), techItem: bool(o.techItem),
          releaseQ: (rQ >= 1 && rQ <= 4) ? rQ : 1,
        };
        return { rec, errs };
      },
      summary: r => `${r.n} · $${r.up} · ${r.cat} · per "${r.formula}"`,
    },
  };

  // assign fresh sequential ids after import
  function reassignIds(arr) {
    let max = 0;
    arr.forEach(x => { if (typeof x.id === 'number' && x.id > max) max = x.id; });
    arr.forEach(x => { if (typeof x.id !== 'number') x.id = ++max; });
    if (D().nextId !== undefined) D().nextId = Math.max(D().nextId || 0, max + 1);
  }

  // re-render + cloud save (mirrors the app's own edit flow)
  function persist(type) {
    const fns = {
      schools: ['renderSchools'], hr: ['renderHR'], supply: ['renderSupply'],
    }[type] || [];
    fns.concat(['renderDashboard', 'updateKPIs', 'updateHRCalcs', 'updateSupplyCalcs']).forEach(fn => {
      try { if (typeof window[fn] === 'function') window[fn](); } catch {}
    });
    try { if (typeof window.setCurrency === 'function' && window.CUR) window.setCurrency(window.CUR.mode); } catch {}
    try { if (typeof window.scheduleSave === 'function') window.scheduleSave(); } catch {}
  }

  // ────────────────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────────────────
  let pending = null; // { type, records, errors }

  function openImporter() {
    if (!canImport()) { alert('Importing is available to editors and admins only.'); return; }
    const ov = document.createElement('div');
    ov.className = 'tk-modal-bg';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `
      <div class="tk-modal tk-imp">
        <div class="tk-modal-hd"><div><i class="ti ti-file-spreadsheet"></i> Import data from CSV</div><button class="tk-x">×</button></div>
        <div class="tk-modal-bd">
          <div class="tk-imp-tabs">
            <button class="tk-imp-tab active" data-t="schools">Schools</button>
            <button class="tk-imp-tab" data-t="hr">HR / Staff</button>
            <button class="tk-imp-tab" data-t="supply">Supply Items</button>
          </div>
          <div id="tk-imp-body"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.tk-x').onclick = () => ov.remove();
    ov.querySelectorAll('.tk-imp-tab').forEach(b => b.onclick = () => {
      ov.querySelectorAll('.tk-imp-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderTab(b.dataset.t);
    });
    renderTab('schools');

    function renderTab(type) {
      pending = null;
      const sc = SCHEMAS[type];
      const count = sc.arr().length;
      const hintRows = sc.headers.map(h =>
        `<tr><td class="tk-h-col">${h}</td><td class="tk-h-hint">${sc.hints[h] || 'text'}</td></tr>`).join('');
      document.getElementById('tk-imp-body').innerHTML = `
        <p class="tk-imp-intro">Currently <b>${count}</b> ${sc.label.toLowerCase()} in the model.
        Download the template, fill it in Excel / Google Sheets, then upload it back.</p>
        <div class="tk-imp-actions">
          <button class="tk-mini2" data-dl="empty"><i class="ti ti-download"></i> Empty template</button>
          <button class="tk-mini2" data-dl="current"><i class="ti ti-download"></i> Template with current data</button>
        </div>
        <details class="tk-cols"><summary>Columns &amp; allowed values</summary>
          <table class="tk-cols-tbl"><tbody>${hintRows}</tbody></table>
          <p class="tk-cols-note">Extra columns are ignored. Missing optional columns get sensible defaults. Only <b>name</b> is strictly required.</p>
        </details>
        <label class="tk-up">
          <input type="file" accept=".csv,text/csv" id="tk-file" hidden>
          <span><i class="ti ti-upload"></i> Choose CSV file…</span>
        </label>
        <div id="tk-preview"></div>`;
      const body = document.getElementById('tk-imp-body');
      body.querySelector('[data-dl="empty"]').onclick = () => download(`takmil_${type}_template.csv`, toCSV(sc.headers, []));
      body.querySelector('[data-dl="current"]').onclick = () =>
        download(`takmil_${type}_current.csv`, toCSV(sc.headers, sc.arr().map(sc.toRow)));
      body.querySelector('#tk-file').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        const rdr = new FileReader();
        rdr.onload = () => handleFile(type, rdr.result, f.name);
        rdr.readAsText(f);
      };
    }

    function handleFile(type, text, fname) {
      const sc = SCHEMAS[type];
      const { objects } = rowsToObjects(parseCSV(text));
      const records = [], errors = [];
      objects.forEach((o, i) => {
        const { rec, errs } = sc.parse(o, i);
        if (errs.length) errors.push({ row: i + 2, errs }); // +2: header + 1-index
        records.push(rec);
      });
      const ok = records.filter((_, i) => !errors.find(e => e.row === i + 2));
      pending = { type, records: ok, errors, total: objects.length };

      const prev = document.getElementById('tk-preview');
      const sample = ok.slice(0, 6).map(r => `<li>${sc.summary(r)}</li>`).join('');
      const errHtml = errors.length
        ? `<div class="tk-err-box"><b>${errors.length} row(s) have problems and will be skipped:</b>
            <ul>${errors.slice(0, 8).map(e => `<li>Row ${e.row}: ${e.errs.join('; ')}</li>`).join('')}</ul>
            ${errors.length > 8 ? `<div>…and ${errors.length - 8} more</div>` : ''}</div>`
        : '';
      prev.innerHTML = `
        <div class="tk-prev-head">Parsed <b>${fname}</b>: ${ok.length} valid row(s)${errors.length ? `, ${errors.length} skipped` : ''}.</div>
        ${errHtml}
        ${ok.length ? `<ul class="tk-prev-list">${sample}${ok.length > 6 ? `<li class="tk-more">…and ${ok.length - 6} more</li>` : ''}</ul>` : ''}
        ${ok.length ? `
          <div class="tk-apply-row">
            <div class="tk-mode">
              <label><input type="radio" name="tk-mode" value="replace" checked> Replace all (clear existing ${sc.arr().length}, import these ${ok.length})</label>
              <label><input type="radio" name="tk-mode" value="append"> Append (keep existing, add these ${ok.length})</label>
            </div>
            <button id="tk-apply" class="tk-btn-primary">Import ${ok.length} ${sc.label.toLowerCase()}</button>
          </div>` : '<div class="tk-err-box">Nothing valid to import. Fix the rows above and re-upload.</div>'}`;
      if (ok.length) document.getElementById('tk-apply').onclick = () => applyImport(ov);
    }
  }

  function applyImport(ov) {
    if (!pending) return;
    const { type, records } = pending;
    const sc = SCHEMAS[type];
    const mode = (document.querySelector('input[name="tk-mode"]:checked') || {}).value || 'replace';
    const target = sc.arr();

    if (mode === 'replace') target.length = 0;
    records.forEach(r => target.push(r));
    reassignIds(target);

    // keep the top-level school/student counts coherent after a school import
    if (type === 'schools' && typeof window.activeSchoolCount === 'function') {
      try {
        D().schools = D().schoolsList.length;
        D().students = D().schoolsList.reduce((a, s) => a + (s.students || 0), 0);
      } catch {}
    }

    persist(type);
    ov.remove();
    const msg = `✓ Imported ${records.length} ${sc.label.toLowerCase()} (${mode === 'replace' ? 'replaced all' : 'appended'})`;
    if (typeof window.showPersistToast === 'function') window.showPersistToast(msg);
    else alert(msg);
  }

  // ── Button in the topbar ──
  function injectButton() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const btn = document.createElement('button');
    btn.id = 'tk-import-btn';
    btn.className = 'tk-import-btn';
    btn.innerHTML = '<i class="ti ti-file-import"></i> Import Data';
    btn.onclick = openImporter;
    const avatar = topbar.querySelector('.avatar');
    if (avatar) topbar.insertBefore(btn, avatar); else topbar.appendChild(btn);
  }

  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
    .tk-import-btn{display:flex;align-items:center;gap:6px;background:var(--bg3,#1a2236);border:.5px solid var(--border2,rgba(255,255,255,.12));color:var(--text2,#e2e8f0);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;margin-right:10px}
    .tk-import-btn:hover{border-color:#10b981;color:#10b981}
    .tk-imp{width:720px;max-width:95vw}
    .tk-imp-intro{font-size:12px;color:var(--text2,#e2e8f0);margin:0 0 14px;line-height:1.5}
    .tk-imp-tabs{display:flex;gap:6px;margin-bottom:16px;border-bottom:.5px solid var(--border,rgba(255,255,255,.08));padding-bottom:0}
    .tk-imp-tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--text3,#94a3b8);padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:-1px}
    .tk-imp-tab.active{color:#10b981;border-bottom-color:#10b981}
    .tk-imp-actions{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
    .tk-mini2{display:flex;align-items:center;gap:6px;background:var(--bg3,#1a2236);border:.5px solid var(--border2,rgba(255,255,255,.12));color:var(--text2,#e2e8f0);border-radius:7px;padding:7px 12px;font-size:11px;cursor:pointer}
    .tk-mini2:hover{border-color:#10b981;color:#10b981}
    .tk-cols{margin:6px 0 14px;font-size:11px;color:var(--text3,#94a3b8)}
    .tk-cols summary{cursor:pointer;padding:6px 0;color:var(--text2,#e2e8f0)}
    .tk-cols-tbl{width:100%;border-collapse:collapse;margin:6px 0}
    .tk-cols-tbl td{padding:4px 8px;border-bottom:.5px solid var(--border,rgba(255,255,255,.06))}
    .tk-h-col{font-family:ui-monospace,monospace;color:#10b981;width:160px}
    .tk-h-hint{color:var(--text3,#94a3b8)}
    .tk-cols-note{margin:8px 0 0;line-height:1.5}
    .tk-up{display:flex;align-items:center;justify-content:center;gap:8px;border:1px dashed var(--border2,rgba(255,255,255,.2));border-radius:10px;padding:18px;font-size:13px;color:var(--text2,#e2e8f0);cursor:pointer;margin:6px 0}
    .tk-up:hover{border-color:#10b981;color:#10b981}
    .tk-prev-head{font-size:12px;color:var(--text,#f1f5f9);margin:14px 0 8px;font-weight:600}
    .tk-prev-list{margin:0 0 12px;padding-left:18px;font-size:12px;color:var(--text2,#e2e8f0);line-height:1.7}
    .tk-prev-list .tk-more{color:var(--text3,#94a3b8);list-style:none}
    .tk-err-box{background:rgba(239,68,68,.1);border:.5px solid rgba(239,68,68,.3);border-radius:8px;padding:10px 12px;font-size:11px;color:#fca5a5;margin:10px 0;line-height:1.6}
    .tk-err-box ul{margin:6px 0 0;padding-left:16px}
    .tk-apply-row{display:flex;flex-direction:column;gap:12px;margin-top:14px;padding-top:14px;border-top:.5px solid var(--border,rgba(255,255,255,.08))}
    .tk-mode{display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--text2,#e2e8f0)}
    .tk-mode label{display:flex;align-items:center;gap:8px;cursor:pointer}
    .tk-apply-row .tk-btn-primary{width:auto;align-self:flex-start;padding:9px 18px;margin:0}
    `;
    document.head.appendChild(s);
  }

  function boot() {
    // Wait until the app + cloud bridge are ready (D and renderers exist).
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window.D && document.querySelector('.topbar') && !document.getElementById('tk-import-btn')) {
        injectStyles(); injectButton(); clearInterval(iv);
      }
      if (tries > 60) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
