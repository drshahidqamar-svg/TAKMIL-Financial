// ════════════════════════════════════════════════════════════════
// takmil-sim.js — Cost-per-Child Simulation page.
//
// Adds a "Simulation" item to the sidebar and a full page that models:
//   schools  = students / avgPerSchool
//   teachers = schools                       (1 per school)
//   coords   = teachers / teachersPerCoord   (default 10)
//   regional = coords  / coordsPerRegional   (default 4)
//   provincial = regional / regionalsPerProv (default 5)
//   HR       = step brackets by total students
//   books, stationery = per student;  technology = per school (amortised)
// Then cost-per-child = total annual cost / students, checked vs target.
//
// Defaults are seeded from the LIVE model (D): real student total, real
// school count -> implied avg/school, and average salaries computed from
// the actual HR list. Everything stays editable. The page recalculates
// live and never writes back to the model (it is a planning sandbox).
// ════════════════════════════════════════════════════════════════
(function () {
  var P = {}; // current params

  function D() { return window.D; }
  var rnd = function (x) { return Math.round(x); };
  var fmt = function (x) { return rnd(x).toLocaleString(); };
  var money = function (x) { return '$' + rnd(x).toLocaleString(); };

  // ── derive sensible defaults from the live model ──
  function seedFromModel() {
    var d = D() || {};
    var students = d.students || 4600;
    var schools = (d.schoolsList && d.schoolsList.length) || d.schools || 153;
    var avgPer = schools > 0 ? Math.max(1, Math.round(students / schools)) : 30;

    // average salaries from the real HR list, split by coordinator flags
    var teach = 150, coord = 300, reg = 500, prov = 700, hr = 400;
    try {
      var list = (d.hrList || []).filter(function (h) { return h.mon > 0; });
      var rcs = list.filter(function (h) { return h.isRC; });
      var fcs = list.filter(function (h) { return h.isFC; });
      var office = list.filter(function (h) { return !h.isRC && !h.isFC; });
      var avg = function (a) { return a.length ? a.reduce(function (s, h) { return s + h.mon; }, 0) / a.length : null; };
      if (d.teacherMon) teach = d.teacherMon;
      if (d.fcoordMon) coord = d.fcoordMon;
      if (avg(rcs)) reg = Math.round(avg(rcs));
      if (avg(office)) hr = Math.round(avg(office));
      if (avg(fcs)) coord = Math.round(avg(fcs));
    } catch (e) {}

    // technology per school + overhead from the model if available
    var techPer = 500, overhead = 68000, books = 8, stat = 3;
    try {
      if (d.overhead) overhead = Object.keys(d.overhead).reduce(function (s, k) { return s + (d.overhead[k] || 0); }, 0);
    } catch (e) {}

    return {
      students: students, avgPer: avgPer, tpc: 10, cpr: 4, rpp: 5, target: 100,
      sTeach: teach, sCoord: coord, sReg: reg, sProv: prov,
      cBooks: books, cStat: stat, cTech: techPer, techYears: 1,
      sHR: hr, hr1: 5, hr2: 9, hr3: 15, hr4: 22, oh: overhead,
    };
  }

  function hrCount(students, p) {
    if (students <= 5000) return p.hr1;
    if (students <= 15000) return p.hr2;
    if (students <= 30000) return p.hr3;
    return p.hr4;
  }

  function compute(students, p) {
    var schools = rnd(students / Math.max(p.avgPer, 1));
    var teachers = schools;
    var coords = rnd(teachers / Math.max(p.tpc, 1));
    var regionals = rnd(coords / Math.max(p.cpr, 1));
    var provincials = rnd(regionals / Math.max(p.rpp, 1));
    var hr = hrCount(students, p);
    var cTeach = teachers * p.sTeach * 12;
    var cCoord = coords * p.sCoord * 12;
    var cReg = regionals * p.sReg * 12;
    var cProv = provincials * p.sProv * 12;
    var cHR = hr * p.sHR * 12;
    var cBooks = students * p.cBooks;
    var cStat = students * p.cStat;
    var cTech = schools * p.cTech / Math.max(p.techYears, 1);
    var cOh = p.oh;
    var total = cTeach + cCoord + cReg + cProv + cHR + cBooks + cStat + cTech + cOh;
    return {
      schools: schools, teachers: teachers, coords: coords, regionals: regionals,
      provincials: provincials, hr: hr, total: total, cpc: students > 0 ? total / students : 0,
      parts: [
        { l: 'Teachers', v: cTeach, c: '#10b981' },
        { l: 'Coordinators', v: cCoord, c: '#3b82f6' },
        { l: 'Regional coords', v: cReg, c: '#8b5cf6' },
        { l: 'Provincial coords', v: cProv, c: '#ec4899' },
        { l: 'HR & staff', v: cHR, c: '#f59e0b' },
        { l: 'Books', v: cBooks, c: '#84cc16' },
        { l: 'Stationery', v: cStat, c: '#14b8a6' },
        { l: 'Technology', v: cTech, c: '#f97316' },
        { l: 'Overhead', v: cOh, c: '#64748b' },
      ],
    };
  }

  function maxStudentsAtTarget(p) {
    var best = 0;
    for (var s = 500; s <= 300000; s += 500) { if (compute(s, p).cpc <= p.target) best = s; }
    return best;
  }

  function v(id) { var e = document.getElementById(id); var n = e ? parseFloat(e.value) : NaN; return isNaN(n) ? 0 : n; }

  function readParams() {
    ['avgPer', 'tpc', 'cpr', 'rpp', 'target', 'sTeach', 'sCoord', 'sReg', 'sProv',
     'cBooks', 'cStat', 'cTech', 'techYears', 'sHR', 'hr1', 'hr2', 'hr3', 'hr4', 'oh']
      .forEach(function (k) { P[k] = v('sim-' + k); });
    P.students = rnd(v('sim-studentsNum'));
    return P;
  }

  function render() {
    if (!document.getElementById('sim-studentsNum')) return;
    var p = readParams();
    var r = compute(p.students, p);
    var set = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };

    set('sim-cpc', money(r.cpc));
    set('sim-total', money(r.total));
    set('sim-schools', fmt(r.schools));
    var maxS = maxStudentsAtTarget(p);
    set('sim-maxStu', maxS > 0 ? fmt(maxS) : '—');
    set('sim-stuOut', fmt(p.students));

    var pass = r.cpc <= p.target;
    var vd = document.getElementById('sim-verdict');
    if (vd) {
      if (pass) {
        vd.style.background = 'rgba(16,185,129,.12)';
        vd.style.borderColor = 'rgba(16,185,129,.3)';
        vd.innerHTML = '<i class="ti ti-circle-check" style="font-size:22px;color:#10b981"></i>' +
          '<div><div style="font-weight:600;color:#10b981">Within target — ' + money(r.cpc) + ' per child</div>' +
          '<div style="font-size:12px;color:#10b981">$' + rnd(p.target - r.cpc) + ' per child headroom at ' + fmt(p.students) + ' students.</div></div>';
      } else {
        var over = r.cpc - p.target;
        vd.style.background = 'rgba(239,68,68,.1)';
        vd.style.borderColor = 'rgba(239,68,68,.3)';
        vd.innerHTML = '<i class="ti ti-alert-triangle" style="font-size:22px;color:#ef4444"></i>' +
          '<div><div style="font-weight:600;color:#ef4444">Over target — ' + money(r.cpc) + ' per child</div>' +
          '<div style="font-size:12px;color:#ef4444">' + money(over) + ' over. Cut ' + money(over * p.students) + '/yr, or cap at ' + (maxS > 0 ? fmt(maxS) : '—') + ' students.</div></div>';
      }
    }

    var casc = document.getElementById('sim-cascade');
    if (casc) casc.innerHTML = [
      { n: r.teachers, l: 'Teachers' }, { n: r.coords, l: 'Coordinators' },
      { n: r.regionals, l: 'Regional' }, { n: r.provincials, l: 'Provincial' },
      { n: r.hr, l: 'HR & staff' },
    ].map(function (c) {
      return '<div class="sim-casc"><div class="sim-casc-n">' + fmt(c.n) + '</div><div class="sim-casc-l">' + c.l + '</div></div>';
    }).join('');

    var bd = document.getElementById('sim-breakdown');
    if (bd) {
      var max = Math.max.apply(null, r.parts.map(function (x) { return x.v; })) || 1;
      bd.innerHTML = r.parts.map(function (x) {
        return '<div class="sim-bd"><div class="sim-bd-l">' + x.l + '</div>' +
          '<div class="sim-bd-w"><div class="sim-bd-bar" style="width:' + (x.v / max * 100) + '%;background:' + x.c + '"></div></div>' +
          '<div class="sim-bd-v">' + money(x.v) + '</div>' +
          '<div class="sim-bd-p">' + rnd(x.v / r.total * 100) + '%</div></div>';
      }).join('');
    }
  }

  function field(id, label, val, hint) {
    return '<label class="sim-f"><span>' + label + '</span>' +
      '<input type="number" id="sim-' + id + '" value="' + val + '">' +
      (hint ? '<em>' + hint + '</em>' : '') + '</label>';
  }

  function buildPage() {
    var p = seedFromModel();
    var html =
    '<div class="page-head"><div><h1 class="page-title">Cost-per-Child Simulation</h1>' +
    '<p class="page-sub">Scale students and see the staffing the structure requires, and whether you stay within target. Seeded from your live data; edit any number. This is a sandbox — it does not change your model.</p></div>' +
    '<button class="c-btn" onclick="takmilSimReset()"><i class="ti ti-refresh"></i> Reseed from live data</button></div>' +

    '<div class="card" style="margin-bottom:14px"><div class="card-body">' +
    '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">' +
    '<span style="font-size:12px;color:var(--text2)">Total students</span>' +
    '<span id="sim-stuOut" style="font-size:24px;font-weight:600;color:var(--text)">' + fmt(p.students) + '</span></div>' +
    '<input type="range" id="sim-students" min="500" max="60000" step="100" value="' + p.students + '" style="width:100%;margin-bottom:8px">' +
    '<div style="display:flex;gap:8px;align-items:center"><span style="font-size:11px;color:var(--text3)">or type:</span>' +
    '<input type="number" id="sim-studentsNum" value="' + p.students + '" min="100" step="100" style="width:120px"> students</div>' +
    '</div></div>' +

    '<div id="sim-verdict" style="display:flex;align-items:center;gap:10px;border:.5px solid;border-radius:10px;padding:12px 16px;margin-bottom:14px"></div>' +

    '<div class="sim-kpis">' +
    '<div class="kpi-card kc-amber"><div class="kpi-label">Cost / child / year</div><div class="kpi-value" id="sim-cpc"></div></div>' +
    '<div class="kpi-card kc-blue"><div class="kpi-label">Total annual cost</div><div class="kpi-value" id="sim-total"></div></div>' +
    '<div class="kpi-card kc-green"><div class="kpi-label">Schools</div><div class="kpi-value" id="sim-schools"></div></div>' +
    '<div class="kpi-card kc-green"><div class="kpi-label">Max students at target</div><div class="kpi-value" id="sim-maxStu"></div></div>' +
    '</div>' +

    '<div class="card" style="margin:14px 0"><div class="card-header"><div class="card-title"><i class="ti ti-sitemap"></i>Staffing required</div></div>' +
    '<div class="card-body"><div class="sim-casc-grid" id="sim-cascade"></div></div></div>' +

    '<div class="card" style="margin-bottom:14px"><div class="card-header"><div class="card-title"><i class="ti ti-chart-bar"></i>Annual cost breakdown</div></div>' +
    '<div class="card-body" id="sim-breakdown"></div></div>' +

    '<div class="card"><div class="card-header"><div class="card-title"><i class="ti ti-adjustments-horizontal"></i>Assumptions</div></div>' +
    '<div class="card-body">' +
    '<div class="sim-grp">Structure &amp; ratios</div><div class="sim-grid">' +
    field('avgPer', 'Avg students / school', p.avgPer) +
    field('tpc', 'Teachers per coordinator', p.tpc) +
    field('cpr', 'Coordinators per regional', p.cpr) +
    field('rpp', 'Regionals per provincial', p.rpp) +
    field('target', 'Cost-per-child target ($)', p.target) +
    '</div>' +
    '<div class="sim-grp">Monthly salaries ($)</div><div class="sim-grid">' +
    field('sTeach', 'Teacher / month', p.sTeach) +
    field('sCoord', 'Coordinator / month', p.sCoord) +
    field('sReg', 'Regional coord / month', p.sReg) +
    field('sProv', 'Provincial coord / month', p.sProv) +
    '</div>' +
    '<div class="sim-grp">Supply costs</div><div class="sim-grid">' +
    field('cBooks', 'Books / student / yr', p.cBooks) +
    field('cStat', 'Stationery / student / yr', p.cStat) +
    field('cTech', 'Technology / school (one-time)', p.cTech) +
    field('techYears', 'Amortise technology over (yrs)', p.techYears, '1 = full cost each year; 3 = spread over 3 years') +
    '</div>' +
    '<div class="sim-grp">HR &amp; head-office staff — step brackets (by total students)</div><div class="sim-grid">' +
    field('sHR', 'Avg HR salary / month ($)', p.sHR) +
    field('hr1', 'HR staff: up to 5,000', p.hr1) +
    field('hr2', 'HR staff: 5,001–15,000', p.hr2) +
    field('hr3', 'HR staff: 15,001–30,000', p.hr3) +
    field('hr4', 'HR staff: 30,001+', p.hr4) +
    '</div>' +
    '<div class="sim-grp">Other fixed overhead</div><div class="sim-grid">' +
    field('oh', 'Annual overhead ($)', p.oh) +
    '</div>' +
    '</div></div>';

    return html;
  }

  // expose reset
  window.takmilSimReset = function () {
    var page = document.getElementById('page-simulation');
    if (page) { page.innerHTML = buildPage(); wire(); render(); }
  };

  function wire() {
    var sl = document.getElementById('sim-students');
    var nm = document.getElementById('sim-studentsNum');
    if (sl) sl.addEventListener('input', function () { if (nm) nm.value = sl.value; render(); });
    if (nm) nm.addEventListener('input', function () { var x = rnd(v('sim-studentsNum')); if (sl && x >= 500 && x <= 60000) sl.value = x; render(); });
    ['avgPer', 'tpc', 'cpr', 'rpp', 'target', 'sTeach', 'sCoord', 'sReg', 'sProv',
     'cBooks', 'cStat', 'cTech', 'techYears', 'sHR', 'hr1', 'hr2', 'hr3', 'hr4', 'oh']
      .forEach(function (k) { var e = document.getElementById('sim-' + k); if (e) e.addEventListener('input', render); });
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
    '.sim-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}' +
    '.sim-casc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}' +
    '.sim-casc{background:var(--bg3);border-radius:8px;padding:12px;text-align:center}' +
    '.sim-casc-n{font-size:20px;font-weight:600;color:var(--text)}' +
    '.sim-casc-l{font-size:11px;color:var(--text2);margin-top:2px}' +
    '.sim-bd{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
    '.sim-bd-l{font-size:12px;width:130px;flex-shrink:0;color:var(--text2)}' +
    '.sim-bd-w{flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden}' +
    '.sim-bd-bar{height:100%;border-radius:4px}' +
    '.sim-bd-v{font-size:12px;width:90px;text-align:right;flex-shrink:0;color:var(--text)}' +
    '.sim-bd-p{font-size:11px;width:42px;text-align:right;flex-shrink:0;color:var(--text3)}' +
    '.sim-grp{font-size:12px;font-weight:600;color:var(--accent);margin:14px 0 8px}' +
    '.sim-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 12px;margin-bottom:6px}' +
    '.sim-f{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text2)}' +
    '.sim-f input{width:100%}.sim-f em{font-size:10px;color:var(--text3);font-style:normal}';
    document.head.appendChild(s);
  }

  function injectNav() {
    var nav = document.querySelector('.nav-item[data-page="insights"]') ||
              document.querySelector('.nav-item[data-page="forecast"]');
    if (!nav || document.querySelector('.nav-item[data-page="simulation"]')) return;
    var item = document.createElement('div');
    item.className = 'nav-item';
    item.setAttribute('data-page', 'simulation');
    item.innerHTML = '<i class="ti ti-calculator"></i>Simulation';
    nav.parentNode.insertBefore(item, nav.nextSibling);

    // page container
    var anchor = document.getElementById('page-insights') || document.getElementById('page-dashboard');
    var page = document.createElement('div');
    page.id = 'page-simulation';
    page.style.display = 'none';
    anchor.parentNode.insertBefore(page, anchor.nextSibling);
    page.innerHTML = buildPage();

    // hook navigation — let the app's own showPage handle show/hide and
    // active states (page-simulation is a real #page-* element, so the
    // generic logic in showPage works), then run our renderer on top.
    item.addEventListener('click', function () {
      if (typeof window.showPage === 'function') {
        try { window.showPage('simulation'); } catch (e) { manualShow(); }
      } else manualShow();
      wire(); render();
    });

    // Also render whenever the app navigates to simulation by any path.
    if (typeof window.showPage === 'function' && !window.showPage.__simWrapped) {
      var orig = window.showPage;
      window.showPage = function (pg) {
        var out = orig.apply(this, arguments);
        if (pg === 'simulation') { wire(); render(); }
        return out;
      };
      window.showPage.__simWrapped = true;
    }
  }

  function manualShow() {
    document.querySelectorAll('[id^="page-"]').forEach(function (el) {
      if (el.id.indexOf('page-') === 0) el.style.display = (el.id === 'page-simulation') ? '' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.page === 'simulation'); });
  }

  function boot() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.D && document.querySelector('.nav-item[data-page]') && !document.querySelector('.nav-item[data-page="simulation"]')) {
        injectStyles(); injectNav(); clearInterval(iv);
      }
      if (tries > 60) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
