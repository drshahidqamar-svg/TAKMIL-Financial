// ════════════════════════════════════════════════════════════════
// takmil-projection.js — "Projection" page.
//
// Starts from the LIVE current model (real schools, students, costs)
// and lets you stack what-if changes, showing the new cost per child
// per year instantly, side by side with the current figure:
//   • Add schools (adds schools + their students + teacher/coord cost)
//   • Add staff in any category (teachers via schools, coordinators,
//     regional, provincial, HR) — count × salary
//   • Salary increment — global % and/or per-category %
//   • Add supply items — quantity × unit cost, one-off or recurring
//
// It never changes the real model. Reads baseline via the app's own
// cost functions so the starting cost/child matches the dashboard.
// ════════════════════════════════════════════════════════════════
(function () {
  function D() { return window.D; }
  var rnd = function (x) { return Math.round(x); };
  var money = function (usd) { return (typeof window.f$ === 'function') ? window.f$(usd) : '$' + rnd(usd).toLocaleString(); };

  // ── read the live baseline from the app's own functions ──
  function baseline() {
    var d = D();
    var students = (typeof window.activeStudentCount === 'function') ? window.activeStudentCount() : (d.students || 0);
    if (!students) students = d.students || 0;
    var schools = (typeof window.activeSchoolCount === 'function') ? window.activeSchoolCount() : (d.schools || (d.schoolsList ? d.schoolsList.length : 0));
    if (!schools) schools = d.schools || 0;

    var field = safe(window.fieldAnn, schools);   // teachers + FC + RC
    var hq = safe(window.hqAnn);                   // HR / head office
    var sup = safe(window.supTotal) || safe(window.supAll, schools);
    var overhead = safe(window.overhead);
    var training = d.training || 0;
    var total = safe(window.totCost, schools) || (field + hq + sup + overhead + training);
    // per-school items cost (from the school-items module) if present
    var itemsCost = (typeof window.takmilTotalItemCost === 'function') ? window.takmilTotalItemCost() : 0;

    return {
      students: students, schools: schools,
      field: field, hq: hq, sup: sup, overhead: overhead, training: training,
      items: itemsCost, total: total + itemsCost,
      cpc: students > 0 ? (total + itemsCost) / students : 0,
      // unit rates for layering
      teacherMon: d.teacherMon || 150, fcoordMon: d.fcoordMon || 300, rcoordMon: d.rcoordMon || 500,
      avgPerSchool: schools > 0 ? Math.round(students / schools) : 30,
    };
  }
  function safe(fn, a) { try { return typeof fn === 'function' ? (fn(a) || 0) : 0; } catch (e) { return 0; } }

  // current what-if inputs
  function inputs() {
    var g = function (id) { var e = document.getElementById(id); var n = e ? parseFloat(e.value) : 0; return isNaN(n) ? 0 : n; };
    return {
      addSchools: g('pj-addSchools'), avgPer: g('pj-avgPer'),
      addTeachers: g('pj-addTeachers'), addCoord: g('pj-addCoord'),
      addReg: g('pj-addReg'), addProv: g('pj-addProv'), addHR: g('pj-addHR'),
      salTeacher: g('pj-salTeacher'), salCoord: g('pj-salCoord'), salReg: g('pj-salReg'),
      salHR: g('pj-salHR'), salGlobal: g('pj-salGlobal'),
      addStudents: g('pj-addStudents'),
      itemQty: g('pj-itemQty'), itemCost: g('pj-itemCost'),
      provMon: g('pj-provMon'), hrMon: g('pj-hrMon'), coordMon: g('pj-coordMon'), regMon: g('pj-regMon'), teachMon: g('pj-teachMon'),
    };
  }

  function project() {
    var b = baseline();
    var i = inputs();

    // ---- students ----
    var newSchoolStudents = i.addSchools * (i.avgPer || b.avgPerSchool);
    var students = b.students + newSchoolStudents + i.addStudents;

    // ---- salary increments (percent) applied to existing field + HQ ----
    var gT = (1 + i.salGlobal / 100) * (1 + i.salTeacher / 100);
    var gC = (1 + i.salGlobal / 100) * (1 + i.salCoord / 100);
    var gR = (1 + i.salGlobal / 100) * (1 + i.salReg / 100);
    var gH = (1 + i.salGlobal / 100) * (1 + i.salHR / 100);

    // Baseline field cost splits are not individually exposed, so apply the
    // teacher increment to the whole field block as an approximation unless
    // per-category salaries are known. We scale field by a blend and HQ by gH.
    // Better: rebuild field from unit rates for the increment portion.
    // Existing field cost scaled: teachers dominate field, so use gT for the
    // teacher share and gC/gR for coordinator shares derived from counts.
    var curSchools = b.schools;
    var curCoord = Math.round(curSchools / 10);
    var curReg = Math.round(curCoord / 4);
    var curProv = Math.round(curReg / 5);
    var curTeacherCost = curSchools * b.teacherMon * 12;
    var curCoordCost = curCoord * b.fcoordMon * 12;
    var curRegCost = curReg * b.rcoordMon * 12;
    // recompute a clean field baseline from unit rates (keeps increments exact)
    var fieldBaseClean = curTeacherCost + curCoordCost + curRegCost;
    // if the app's fieldAnn differs (per-school overrides etc.), keep its extra as a fixed remainder
    var fieldRemainder = b.field - fieldBaseClean;

    // ---- new staff added ----
    var addTeacherCost = (i.addSchools + i.addTeachers) * (i.teachMon || b.teacherMon) * 12;
    // schools also pull coordinators automatically via cascade:
    var cascadeCoord = Math.round((curSchools + i.addSchools) / 10) - curCoord;
    var cascadeReg = Math.round(Math.round((curSchools + i.addSchools) / 10) / 4) - curReg;
    var cascadeProv = Math.round(Math.round(Math.round((curSchools + i.addSchools) / 10) / 4) / 5) - curProv;

    var totalNewCoord = i.addCoord + Math.max(0, cascadeCoord);
    var totalNewReg = i.addReg + Math.max(0, cascadeReg);
    var totalNewProv = i.addProv + Math.max(0, cascadeProv);

    var addCoordCost = totalNewCoord * (i.coordMon || b.fcoordMon) * 12;
    var addRegCost = totalNewReg * (i.regMon || b.rcoordMon) * 12;
    var addProvCost = totalNewProv * (i.provMon || 700) * 12;
    var addHRCost = i.addHR * (i.hrMon || 400) * 12;

    // ---- assemble new field & HQ with increments ----
    var newTeacherCost = (curTeacherCost * gT) + addTeacherCost;
    var newCoordCost = (curCoordCost * gC) + addCoordCost;
    var newRegCost = (curRegCost * gR) + addRegCost;
    var newField = newTeacherCost + newCoordCost + newRegCost + fieldRemainder + addProvCost;
    var newHQ = (b.hq * gH) + addHRCost;

    // ---- items ----
    var addItemsCost = i.itemQty * i.itemCost;

    // ---- supply/overhead/training carry over; new schools scale supply per school ----
    var supPerSchool = curSchools > 0 ? b.sup / curSchools : 0;
    var newSup = b.sup + supPerSchool * i.addSchools;

    var newTotal = newField + newHQ + newSup + b.overhead + b.training + b.items + addItemsCost;
    var newCpc = students > 0 ? newTotal / students : 0;

    return {
      b: b, students: students,
      total: newTotal, cpc: newCpc,
      newSchools: curSchools + i.addSchools,
      newCoord: curCoord + totalNewCoord, newReg: curReg + totalNewReg, newProv: curProv + totalNewProv,
      newHRcount: null,
      parts: {
        field: newField, hq: newHQ, sup: newSup,
        overhead: b.overhead, training: b.training, items: b.items + addItemsCost,
      },
      addStudents: newSchoolStudents + i.addStudents,
    };
  }

  function render() {
    if (!document.getElementById('pj-addSchools')) return;
    var r = project(); var b = r.b;
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };

    set('pj-base-cpc', money(b.cpc));
    set('pj-base-students', b.students.toLocaleString());
    set('pj-base-total', money(b.total));
    set('pj-base-schools', b.schools.toLocaleString());

    set('pj-new-cpc', money(r.cpc));
    set('pj-new-students', r.students.toLocaleString());
    set('pj-new-total', money(r.total));
    set('pj-new-schools', r.newSchools.toLocaleString());

    // delta
    var d = r.cpc - b.cpc;
    var dEl = document.getElementById('pj-delta');
    if (dEl) {
      var up = d > 0.5, dn = d < -0.5;
      dEl.textContent = (up ? '▲ +' : dn ? '▼ ' : '≈ ') + money(Math.abs(d)) + ' / child';
      dEl.style.color = up ? 'var(--red,#ef4444)' : dn ? 'var(--accent,#10b981)' : 'var(--text2)';
    }
    // target check
    var tgt = D().target || 100;
    var tEl = document.getElementById('pj-target');
    if (tEl) {
      var ok = r.cpc <= tgt;
      tEl.innerHTML = ok
        ? '<span style="color:var(--accent,#10b981)"><i class="ti ti-circle-check"></i> Within $' + tgt + ' target (' + money(tgt - r.cpc) + ' headroom)</span>'
        : '<span style="color:var(--red,#ef4444)"><i class="ti ti-alert-triangle"></i> ' + money(r.cpc - tgt) + ' over the $' + tgt + ' target</span>';
    }

    // breakdown bars
    var parts = [
      { l: 'Field (teachers + coords)', v: r.parts.field, c: '#10b981' },
      { l: 'HR & head office', v: r.parts.hq, c: '#f59e0b' },
      { l: 'Supply', v: r.parts.sup, c: '#f97316' },
      { l: 'Per-school items', v: r.parts.items, c: '#8b5cf6' },
      { l: 'Overhead', v: r.parts.overhead, c: '#64748b' },
      { l: 'Training', v: r.parts.training, c: '#3b82f6' },
    ];
    var max = Math.max.apply(null, parts.map(function (x) { return x.v; })) || 1;
    var bd = document.getElementById('pj-breakdown');
    if (bd) bd.innerHTML = parts.map(function (x) {
      return '<div class="pj-bd"><div class="pj-bd-l">' + x.l + '</div>' +
        '<div class="pj-bd-w"><div class="pj-bd-bar" style="width:' + (x.v / max * 100) + '%;background:' + x.c + '"></div></div>' +
        '<div class="pj-bd-v">' + money(x.v) + '</div></div>';
    }).join('');

    set('pj-cascade', 'After changes: ' + r.newSchools.toLocaleString() + ' schools · ' +
      r.newCoord + ' coordinators · ' + r.newReg + ' regional · ' + r.newProv + ' provincial · +' +
      rnd(r.addStudents).toLocaleString() + ' students');
  }

  function num(id, label, val, hint) {
    return '<label class="pj-f"><span>' + label + '</span>' +
      '<input type="number" id="' + id + '" value="' + val + '" step="1">' +
      (hint ? '<em>' + hint + '</em>' : '') + '</label>';
  }

  function buildPage() {
    var b = baseline();
    return '' +
    '<div class="page-head"><div><h1 class="page-title">Projection — What-if cost per child</h1>' +
    '<p class="page-sub">Starts from your live current figures. Add schools, staff, salary increases, or items and see the new cost per child per year instantly. Nothing here changes your real model.</p></div>' +
    '<button class="c-btn" onclick="takmilProjReset()"><i class="ti ti-refresh"></i> Reset changes</button></div>' +

    // before / after
    '<div class="pj-compare">' +
    '<div class="pj-side"><div class="pj-side-h">Current (live)</div>' +
    '<div class="pj-big" id="pj-base-cpc"></div><div class="pj-side-sub">per child / year</div>' +
    '<div class="pj-side-meta"><span id="pj-base-students"></span> students · <span id="pj-base-schools"></span> schools · <span id="pj-base-total"></span></div></div>' +
    '<div class="pj-arrow"><div id="pj-delta" class="pj-delta"></div><i class="ti ti-arrow-right" style="font-size:22px;color:var(--text3)"></i></div>' +
    '<div class="pj-side pj-side-new"><div class="pj-side-h">Projected</div>' +
    '<div class="pj-big" id="pj-new-cpc"></div><div class="pj-side-sub">per child / year</div>' +
    '<div class="pj-side-meta"><span id="pj-new-students"></span> students · <span id="pj-new-schools"></span> schools · <span id="pj-new-total"></span></div></div>' +
    '</div>' +

    '<div id="pj-target" style="text-align:center;font-size:13px;font-weight:600;margin:10px 0 4px"></div>' +
    '<div id="pj-cascade" style="text-align:center;font-size:12px;color:var(--text3);margin-bottom:16px"></div>' +

    // change controls
    '<div class="card"><div class="card-header"><div class="card-title"><i class="ti ti-plus"></i>Add / change</div></div><div class="card-body">' +

    '<div class="pj-grp">Add schools</div><div class="pj-grid">' +
    num('pj-addSchools', 'Number of new schools', 0) +
    num('pj-avgPer', 'Students per new school', b.avgPerSchool, 'adds students + teacher + coordinator cascade') +
    '</div>' +

    '<div class="pj-grp">Add students only (no new schools)</div><div class="pj-grid">' +
    num('pj-addStudents', 'Extra students', 0, 'into existing schools') +
    '</div>' +

    '<div class="pj-grp">Add staff</div><div class="pj-grid">' +
    num('pj-addTeachers', 'Extra teachers', 0) +
    num('pj-teachMon', 'Teacher salary / mo', b.teacherMon) +
    num('pj-addCoord', 'Extra coordinators', 0) +
    num('pj-coordMon', 'Coordinator salary / mo', b.fcoordMon) +
    num('pj-addReg', 'Extra regional coords', 0) +
    num('pj-regMon', 'Regional salary / mo', b.rcoordMon) +
    num('pj-addProv', 'Extra provincial coords', 0) +
    num('pj-provMon', 'Provincial salary / mo', 700) +
    num('pj-addHR', 'Extra HR / staff', 0) +
    num('pj-hrMon', 'HR salary / mo', 400) +
    '</div>' +

    '<div class="pj-grp">Salary increment (%)</div><div class="pj-grid">' +
    num('pj-salGlobal', 'All salaries +%', 0, 'applies on top of per-category') +
    num('pj-salTeacher', 'Teachers +%', 0) +
    num('pj-salCoord', 'Coordinators +%', 0) +
    num('pj-salReg', 'Regional +%', 0) +
    num('pj-salHR', 'HR / staff +%', 0) +
    '</div>' +

    '<div class="pj-grp">Add an item (one-off)</div><div class="pj-grid">' +
    num('pj-itemQty', 'Quantity', 0) +
    num('pj-itemCost', 'Unit cost ($)', 0) +
    '</div>' +

    '</div></div>' +

    '<div class="card" style="margin-top:14px"><div class="card-header"><div class="card-title"><i class="ti ti-chart-bar"></i>Projected annual cost breakdown</div></div>' +
    '<div class="card-body" id="pj-breakdown"></div></div>';
  }

  window.takmilProjReset = function () {
    var page = document.getElementById('page-projection');
    if (page) { page.innerHTML = buildPage(); wire(); render(); }
  };

  function wire() {
    var ids = ['pj-addSchools', 'pj-avgPer', 'pj-addStudents', 'pj-addTeachers', 'pj-teachMon',
      'pj-addCoord', 'pj-coordMon', 'pj-addReg', 'pj-regMon', 'pj-addProv', 'pj-provMon',
      'pj-addHR', 'pj-hrMon', 'pj-salGlobal', 'pj-salTeacher', 'pj-salCoord', 'pj-salReg', 'pj-salHR',
      'pj-itemQty', 'pj-itemCost'];
    ids.forEach(function (id) { var e = document.getElementById(id); if (e) e.addEventListener('input', render); });
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.pj-compare{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-bottom:6px}' +
      '.pj-side{background:var(--bg3);border-radius:12px;padding:16px;text-align:center}' +
      '.pj-side-new{background:rgba(16,185,129,.08);border:.5px solid rgba(16,185,129,.25)}' +
      '.pj-side-h{font-size:12px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}' +
      '.pj-big{font-size:34px;font-weight:600;color:var(--text)}' +
      '.pj-side-sub{font-size:11px;color:var(--text3)}' +
      '.pj-side-meta{font-size:11px;color:var(--text2);margin-top:8px}' +
      '.pj-arrow{display:flex;flex-direction:column;align-items:center;gap:6px}' +
      '.pj-delta{font-size:12px;font-weight:600;white-space:nowrap}' +
      '.pj-grp{font-size:12px;font-weight:600;color:var(--accent);margin:14px 0 8px}' +
      '.pj-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px 12px;margin-bottom:4px}' +
      '.pj-f{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text2)}' +
      '.pj-f input{width:100%}.pj-f em{font-size:10px;color:var(--text3);font-style:normal}' +
      '.pj-bd{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
      '.pj-bd-l{font-size:12px;width:170px;flex-shrink:0;color:var(--text2)}' +
      '.pj-bd-w{flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden}' +
      '.pj-bd-bar{height:100%;border-radius:4px}' +
      '.pj-bd-v{font-size:12px;width:100px;text-align:right;flex-shrink:0;color:var(--text)}' +
      '@media(max-width:700px){.pj-compare{grid-template-columns:1fr}.pj-arrow{flex-direction:row;justify-content:center}}';
    document.head.appendChild(s);
  }

  function injectNav() {
    var simNav = document.querySelector('.nav-item[data-page="simulation"]');
    var anchorNav = simNav || document.querySelector('.nav-item[data-page="insights"]') || document.querySelector('.nav-item[data-page="forecast"]');
    if (!anchorNav || document.querySelector('.nav-item[data-page="projection"]')) return;

    var item = document.createElement('div');
    item.className = 'nav-item';
    item.setAttribute('data-page', 'projection');
    item.innerHTML = '<i class="ti ti-trending-up"></i>Projection';
    anchorNav.parentNode.insertBefore(item, anchorNav.nextSibling);

    var anchorPage = document.getElementById('page-simulation') || document.getElementById('page-insights') || document.getElementById('page-dashboard');
    var page = document.createElement('div');
    page.id = 'page-projection';
    page.style.display = 'none';
    anchorPage.parentNode.insertBefore(page, anchorPage.nextSibling);
    page.innerHTML = buildPage();

    item.addEventListener('click', function () {
      if (typeof window.showPage === 'function') { try { window.showPage('projection'); } catch (e) {} }
      wire(); render();
    });

    if (typeof window.showPage === 'function' && !window.showPage.__projWrapped) {
      var orig = window.showPage;
      window.showPage = function (pg) {
        var out = orig.apply(this, arguments);
        if (pg === 'projection') { wire(); render(); }
        return out;
      };
      window.showPage.__projWrapped = true;
    }
  }

  function boot() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.D && typeof window.cpc === 'function' && document.querySelector('.nav-item[data-page]') && !document.querySelector('.nav-item[data-page="projection"]')) {
        injectStyles(); injectNav(); clearInterval(iv);
      }
      if (tries > 80) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
