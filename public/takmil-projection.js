// ════════════════════════════════════════════════════════════════
// takmil-projection.js — Projection page (rebuilt).
//
// TWO tools, both read-only (never change real data):
// 1) FORWARD: "add N students" → treated as new schools (N ÷ avg/school).
//    Cascades teachers/coordinators/regional/provincial + items + overhead
//    (scaled proportionally), shows new total cost & cost/child vs current.
// 2) REVERSE: "what setup hits target/child?" → target students/school +
//    ranked levers.
//
// Baseline read live from the app's own functions so it matches dashboard.
// ════════════════════════════════════════════════════════════════
(function () {
  function D() { return window.D; }
  var rnd = function (x) { return Math.round(x); };
  var money = function (u) { return (typeof window.f$ === 'function') ? window.f$(u) : '$' + rnd(u).toLocaleString(); };
  function callNum(fn, a) { try { return typeof window[fn] === 'function' ? (window[fn](a) || 0) : 0; } catch (e) { return 0; } }

  function baseline() {
    var d = D();
    var schools = callNum('activeSchoolCount') || (d.schoolsList ? d.schoolsList.length : 0) || d.schools || 0;
    var students = callNum('activeStudentCount') || d.students || 0;
    var field = callNum('fieldAnn', schools);
    var hq = callNum('hqAnn');
    var sup = callNum('supTotal');
    var overhead = callNum('overhead');
    var training = d.training || 0;
    var total = field + hq + sup + overhead + training;
    var avgPer = schools > 0 ? students / schools : 30;

    var teachers = schools;
    var coords = rnd(schools / 10);
    var regional = rnd(coords / 4);
    var provincial = rnd(regional / 5);
    var area = rnd(regional / 8);
    var program = rnd(area / 4);

    var teacherMon = d.teacherMon || 150, fcoordMon = d.fcoordMon || 300, rcoordMon = d.rcoordMon || 500, provMon = d.provMon || 700;
    var areaMon = d.areaMon || 900, pmMon = d.pmMon || 1200;

    var perSchoolItemCost = 0;
    try {
      if (window.TAKMIL_ITEMS && typeof window.takmilAnnualPerSchool === 'function') {
        window.TAKMIL_ITEMS.forEach(function (it) { perSchoolItemCost += (window.takmilAnnualPerSchool(it.k) || 0); });
      }
    } catch (e) {}

    return {
      schools: schools, students: students, avgPer: avgPer,
      field: field, hq: hq, sup: sup, overhead: overhead, training: training,
      total: total, cpc: students > 0 ? total / students : 0,
      teachers: teachers, coords: coords, regional: regional, provincial: provincial, area: area, program: program,
      teacherMon: teacherMon, fcoordMon: fcoordMon, rcoordMon: rcoordMon, provMon: provMon, areaMon: areaMon, pmMon: pmMon,
      perSchoolItemCost: perSchoolItemCost,
    };
  }

  function project(addStudents, opts) {
    var b = baseline();
    opts = opts || {};
    var avgPer = Math.max(1, opts.avgPer || b.avgPer);
    var newSchools = Math.max(0, Math.round(addStudents / avgPer));
    var newStudents = newSchools * Math.round(avgPer);
    var totStudents = b.students + newStudents;
    var totSchools = b.schools + newSchools;

    var newTeachers = totSchools;
    var newCoords = rnd(totSchools / 10);
    var newRegional = rnd(newCoords / 4);
    var newProvincial = rnd(newRegional / 5);
    var newArea = rnd(newRegional / 8);
    var newProgram = rnd(newArea / 4);

    var addTeachers = newTeachers - b.teachers;
    var addCoords = newCoords - b.coords;
    var addRegional = newRegional - b.regional;
    var addProvincial = newProvincial - b.provincial;
    var addArea = newArea - b.area;
    var addProgram = newProgram - b.program;

    var addTeacherCost = addTeachers * b.teacherMon * 12;
    var addCoordCost = addCoords * b.fcoordMon * 12;
    var addRegCost = addRegional * b.rcoordMon * 12;
    var addProvCost = addProvincial * b.provMon * 12;
    var addAreaCost = addArea * b.areaMon * 12;
    var addProgramCost = addProgram * b.pmMon * 12;
    var addItemCost = newSchools * b.perSchoolItemCost;

    var newOverhead = b.students > 0 ? b.overhead * (totStudents / b.students) : b.overhead;
    var addOverhead = newOverhead - b.overhead;

    var addTotal = addTeacherCost + addCoordCost + addRegCost + addProvCost + addAreaCost + addProgramCost + addItemCost + addOverhead;
    var newTotal = b.total + addTotal;
    var newCpc = totStudents > 0 ? newTotal / totStudents : 0;

    return {
      b: b, newSchools: newSchools, newStudents: newStudents, totStudents: totStudents, totSchools: totSchools,
      addTeachers: addTeachers, addCoords: addCoords, addRegional: addRegional, addProvincial: addProvincial,
      addArea: addArea, addProgram: addProgram,
      addTeacherCost: addTeacherCost, addCoordCost: addCoordCost, addRegCost: addRegCost, addProvCost: addProvCost,
      addAreaCost: addAreaCost, addProgramCost: addProgramCost,
      addItemCost: addItemCost, addOverhead: addOverhead, addTotal: addTotal, newTotal: newTotal, newCpc: newCpc,
    };
  }

  function cpcAtAvg(b, avg) {
    var schools = Math.max(1, Math.round(b.students / avg));
    var coords = rnd(schools / 10), regional = rnd(coords / 4), provincial = rnd(regional / 5);
    var area = rnd(regional / 8), program = rnd(area / 4);
    var fieldCost = schools * b.teacherMon * 12 + coords * b.fcoordMon * 12 + regional * b.rcoordMon * 12
      + provincial * b.provMon * 12 + area * b.areaMon * 12 + program * b.pmMon * 12;
    var itemCost = schools * b.perSchoolItemCost;
    var total = fieldCost + itemCost + b.hq + b.overhead + b.training;
    return { cpc: b.students > 0 ? total / b.students : 0, schools: schools };
  }

  function solveForTarget(target) {
    var b = baseline();
    var best = null;
    for (var avg = Math.round(b.avgPer); avg <= 80; avg++) {
      var r = cpcAtAvg(b, avg);
      if (r.cpc <= target) { best = { avg: avg, schools: r.schools, cpc: r.cpc }; break; }
    }
    return { b: b, target: target, result: best };
  }

  function rankLevers() {
    var b = baseline();
    var baseCpc = b.cpc;
    function cpcWith(mods) {
      var avgPer = mods.avgPer || b.avgPer;
      var teacherMon = mods.teacherMon != null ? mods.teacherMon : b.teacherMon;
      var schools = Math.max(1, Math.round(b.students / avgPer));
      var coords = rnd(schools / 10), regional = rnd(coords / 4), provincial = rnd(regional / 5);
      var area = rnd(regional / 8), program = rnd(area / 4);
      var fieldCost = schools * teacherMon * 12 + coords * b.fcoordMon * 12 + regional * b.rcoordMon * 12
        + provincial * b.provMon * 12 + area * b.areaMon * 12 + program * b.pmMon * 12;
      var itemCost = schools * b.perSchoolItemCost;
      var total = fieldCost + itemCost + b.hq + b.overhead + b.training;
      return b.students > 0 ? total / b.students : 0;
    }
    var levers = [
      { name: 'Increase students/school by 5 (to ' + Math.round(b.avgPer + 5) + ')', save: baseCpc - cpcWith({ avgPer: b.avgPer + 5 }) },
      { name: 'Increase students/school by 10 (to ' + Math.round(b.avgPer + 10) + ')', save: baseCpc - cpcWith({ avgPer: b.avgPer + 10 }) },
      { name: 'Reduce teacher salary 10%', save: baseCpc - cpcWith({ teacherMon: b.teacherMon * 0.9 }) },
    ];
    return levers.filter(function (l) { return l.save > 0.01; }).sort(function (a, c) { return c.save - a.save; });
  }

  function el(id) { return document.getElementById(id); }
  function v(id) { var e = el(id); var n = e ? parseFloat(e.value) : 0; return isNaN(n) ? 0 : n; }

  function kpi(label, val) {
    return '<div class="pj-kpi"><div class="pj-kpi-l">' + label + '</div><div class="pj-kpi-v">' + (typeof val === 'number' ? val.toLocaleString() : val) + '</div></div>';
  }
  function needCard(n, label) {
    return '<div class="pj-need-card"><div class="pj-need-n">+' + (n || 0).toLocaleString() + '</div><div class="pj-need-l">' + label + '</div></div>';
  }
  function costLine(label, val) {
    return '<div class="pj-cost-line"><span>' + label + '</span><span>' + money(val) + '</span></div>';
  }

  function buildPage() {
    var b = baseline();
    return '' +
    '<div class="page-head"><div><h1 class="page-title">Projection</h1>' +
    '<p class="page-sub">See what it takes to grow, and what setup reaches your target. Read-only — nothing here changes your live data.</p></div></div>' +
    '<div class="card" style="margin-bottom:14px"><div class="card-header"><div class="card-title"><i class="ti ti-photo"></i>Current setup (live)</div></div>' +
    '<div class="card-body"><div class="pj-kpis">' +
    kpi('Schools', b.schools) + kpi('Students', b.students) + kpi('Avg/school', Math.round(b.avgPer)) +
    kpi('Cost/child', money(b.cpc)) + kpi('Total budget', money(b.total)) +
    '</div></div></div>' +
    '<div class="card" style="margin-bottom:14px"><div class="card-header"><div class="card-title"><i class="ti ti-trending-up"></i>If we grow…</div></div>' +
    '<div class="card-body"><div class="pj-controls">' +
    '<label class="pj-f"><span>Add students</span><input type="number" id="pj-add" value="500" min="0" step="50"></label>' +
    '<label class="pj-f"><span>As new schools of (students each)</span><input type="number" id="pj-avg" value="' + Math.round(b.avgPer) + '" min="1"></label>' +
    '</div><div id="pj-forward"></div></div></div>' +
    '<div class="card"><div class="card-header"><div class="card-title"><i class="ti ti-target"></i>To reach a target cost/child</div></div>' +
    '<div class="card-body"><div class="pj-controls">' +
    '<label class="pj-f"><span>Target cost/child ($)</span><input type="number" id="pj-target" value="100" min="1"></label>' +
    '</div><div id="pj-reverse"></div></div></div>';
  }

  function renderForward() {
    var host = el('pj-forward'); if (!host) return;
    var r = project(rnd(v('pj-add')), { avgPer: rnd(v('pj-avg')) });
    var b = r.b;
    var target = D().target || 100;
    var pass = r.newCpc <= target;
    host.innerHTML =
      '<div class="pj-before-after">' +
      '<div class="pj-ba-col"><div class="pj-ba-h">Now</div><div class="pj-ba-big">' + money(b.cpc) + '</div>' +
      '<div class="pj-ba-sub">' + b.students.toLocaleString() + ' students · ' + b.schools + ' schools</div></div>' +
      '<div class="pj-ba-arrow"><i class="ti ti-arrow-right"></i></div>' +
      '<div class="pj-ba-col pj-ba-new"><div class="pj-ba-h">After adding ' + r.newStudents.toLocaleString() + ' students</div>' +
      '<div class="pj-ba-big">' + money(r.newCpc) + '</div><div class="pj-ba-sub">' + r.totStudents.toLocaleString() + ' students · ' + r.totSchools + ' schools</div></div></div>' +
      '<div class="pj-need-title">What you\u2019d need to add</div><div class="pj-need-grid">' +
      needCard(r.newSchools, 'New schools') + needCard(r.addTeachers, 'Teachers') + needCard(r.addCoords, 'Coordinators') +
      needCard(r.addRegional, 'Regional coords') + needCard(r.addProvincial, 'Provincial coords') +
      needCard(r.addArea, 'Area Managers') + needCard(r.addProgram, 'Program Managers') + '</div>' +
      '<div class="pj-cost-lines">' +
      costLine('Teacher salaries', r.addTeacherCost) + costLine('Coordinator salaries', r.addCoordCost) +
      costLine('Regional coordinators', r.addRegCost) + costLine('Provincial coordinators', r.addProvCost) +
      costLine('Area Managers', r.addAreaCost) + costLine('Program Managers', r.addProgramCost) +
      costLine('Items & technology', r.addItemCost) + costLine('Overhead (scaled)', r.addOverhead) +
      '<div class="pj-cost-total"><span>Extra annual cost</span><span>' + money(r.addTotal) + '</span></div></div>' +
      '<div class="pj-verdict ' + (pass ? 'ok' : 'over') + '">' +
      (pass ? '\u2713 New cost/child ' + money(r.newCpc) + ' is within your ' + money(target) + ' target'
            : '\u26a0 New cost/child ' + money(r.newCpc) + ' is above your ' + money(target) + ' target') + '</div>';
  }

  function renderReverse() {
    var host = el('pj-reverse'); if (!host) return;
    var target = v('pj-target') || 100;
    var s = solveForTarget(target);
    var b = s.b;
    var html = '';
    if (s.result) {
      html += '<div class="pj-verdict ok" style="margin-bottom:12px">To reach ' + money(target) +
        '/child, run about <b>' + s.result.avg + ' students per school</b> (around <b>' + s.result.schools +
        ' schools</b> for your ' + b.students.toLocaleString() + ' students). Projected: <b>' + money(s.result.cpc) + '/child</b>.</div>';
    } else {
      html += '<div class="pj-verdict over" style="margin-bottom:12px">Target ' + money(target) +
        '/child isn\u2019t reachable by class size alone (even at 80/school). You\u2019d also need to cut salaries, item costs, or overhead \u2014 see levers.</div>';
    }
    var levers = rankLevers();
    html += '<div class="pj-need-title">Biggest levers (cost/child saved)</div><div class="pj-levers">';
    if (levers.length) levers.forEach(function (l) {
      html += '<div class="pj-lever"><span>' + l.name + '</span><span class="pj-lever-save">\u2212' + money(l.save) + '/child</span></div>';
    }); else html += '<div style="font-size:12px;color:var(--text3)">No single lever changes cost/child much at current settings.</div>';
    html += '</div>';
    html += '<div class="pj-need-title" style="margin-top:12px">Cost/child at different class sizes</div><div class="pj-curve">';
    var sizes = [Math.round(b.avgPer), Math.round(b.avgPer) + 5, Math.round(b.avgPer) + 10, Math.round(b.avgPer) + 15, 40, 50]
      .filter(function (x, i, arr) { return arr.indexOf(x) === i && x > 0; }).sort(function (a, c) { return a - c; });
    sizes.forEach(function (avg) {
      var r = cpcAtAvg(b, avg);
      var hit = r.cpc <= target;
      html += '<div class="pj-curve-row"><span>' + avg + '/school</span><span style="color:' + (hit ? 'var(--accent,#10b981)' : 'var(--text2)') + '">' + money(r.cpc) + '/child</span></div>';
    });
    html += '</div>';
    host.innerHTML = html;
  }

  function renderAll() { renderForward(); renderReverse(); }
  function wire() {
    ['pj-add', 'pj-avg'].forEach(function (id) { var e = el(id); if (e) e.addEventListener('input', renderForward); });
    var t = el('pj-target'); if (t) t.addEventListener('input', renderReverse);
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.pj-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}' +
      '.pj-kpi{background:var(--bg3);border-radius:8px;padding:10px 12px}' +
      '.pj-kpi-l{font-size:11px;color:var(--text3)}.pj-kpi-v{font-size:18px;font-weight:600;color:var(--text)}' +
      '.pj-controls{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px}' +
      '.pj-f{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text2)}' +
      '.pj-f input{width:180px;background:var(--bg3);border:.5px solid var(--border2);border-radius:6px;padding:6px 8px;color:var(--text)}' +
      '.pj-before-after{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-bottom:16px}' +
      '.pj-ba-col{background:var(--bg3);border-radius:10px;padding:14px;text-align:center}' +
      '.pj-ba-new{background:rgba(16,185,129,.08);border:.5px solid rgba(16,185,129,.25)}' +
      '.pj-ba-h{font-size:11px;color:var(--text3);margin-bottom:6px}' +
      '.pj-ba-big{font-size:26px;font-weight:700;color:var(--text)}' +
      '.pj-ba-sub{font-size:11px;color:var(--text2);margin-top:4px}.pj-ba-arrow{color:var(--text3);font-size:20px}' +
      '.pj-need-title{font-size:12px;font-weight:600;color:var(--accent);margin:14px 0 8px}' +
      '.pj-need-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin-bottom:12px}' +
      '.pj-need-card{background:var(--bg3);border-radius:8px;padding:10px;text-align:center}' +
      '.pj-need-n{font-size:20px;font-weight:700;color:var(--text)}.pj-need-l{font-size:10px;color:var(--text2)}' +
      '.pj-cost-lines{margin:8px 0}' +
      '.pj-cost-line{display:flex;justify-content:space-between;font-size:12px;color:var(--text2);padding:4px 0}' +
      '.pj-cost-total{display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:var(--text);border-top:.5px solid var(--border2);padding-top:8px;margin-top:4px}' +
      '.pj-verdict{border-radius:8px;padding:10px 12px;font-size:12px;margin-top:12px}' +
      '.pj-verdict.ok{background:rgba(16,185,129,.1);color:var(--accent,#10b981)}' +
      '.pj-verdict.over{background:rgba(239,68,68,.1);color:#ef4444}' +
      '.pj-levers,.pj-curve{display:flex;flex-direction:column;gap:5px}' +
      '.pj-lever,.pj-curve-row{display:flex;justify-content:space-between;font-size:12px;background:var(--bg3);border-radius:6px;padding:6px 10px;color:var(--text2)}' +
      '.pj-lever-save{color:var(--accent,#10b981);font-weight:600}';
    document.head.appendChild(s);
  }

  function injectNav() {
    var anchorNav = document.querySelector('.nav-item[data-page="insights"]') || document.querySelector('.nav-item[data-page="dashboard"]');
    if (!anchorNav || document.querySelector('.nav-item[data-page="projection"]')) return;
    var item = document.createElement('div');
    item.className = 'nav-item';
    item.setAttribute('data-page', 'projection');
    item.innerHTML = '<i class="ti ti-trending-up"></i>Projection';
    anchorNav.parentNode.insertBefore(item, anchorNav.nextSibling);

    var anchorPage = document.getElementById('page-insights') || document.getElementById('page-dashboard');
    var page = document.createElement('div');
    page.id = 'page-projection';
    page.style.display = 'none';
    anchorPage.parentNode.insertBefore(page, anchorPage.nextSibling);
    page.innerHTML = buildPage();

    item.addEventListener('click', function () {
      if (typeof window.showPage === 'function') { try { window.showPage('projection'); } catch (e) {} }
      page.innerHTML = buildPage(); wire(); renderAll();
    });
    if (typeof window.showPage === 'function' && !window.showPage.__projWrapped) {
      var orig = window.showPage;
      window.showPage = function (pg) {
        var out = orig.apply(this, arguments);
        if (pg === 'projection') { page.innerHTML = buildPage(); wire(); renderAll(); }
        return out;
      };
      window.showPage.__projWrapped = true;
    }
  }

  function boot() {
    var t = 0;
    var iv = setInterval(function () {
      t++;
      if (window.D && typeof window.cpc === 'function' && document.querySelector('.nav-item[data-page]') && !document.querySelector('.nav-item[data-page="projection"]')) {
        injectStyles(); injectNav(); clearInterval(iv);
      }
      if (t > 80) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
