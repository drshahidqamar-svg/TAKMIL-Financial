// ════════════════════════════════════════════════════════════════
// takmil-schoolitems.js — per-school item quantities, timing & costs.
//
// EVERY item has TWO things:
//   1. A QUANTITY RULE (how many that school needs):
//        ratio      : qty = ceil(students / ratio)   Books, Chromebooks
//        perSchool  : qty = fixed count              Laptops, USB Drives,
//                                                    Learning Mats, Lesson
//                                                    Planners, Solar Panels,
//                                                    Projectors, Whiteboards,
//                                                    School Banners, Internet
//        perStudent : qty = students                 School Bags, Stationery
//                                                    Kits, Assessment Copies
//   2. PER-SCHOOL QUARTER TIMING (Q1..Q4 checkboxes) — WHEN that school
//      receives it. Cost lands in the ticked quarter(s), so quarterly
//      budgets recalculate correctly. A school with no quarter ticked
//      simply doesn't get that item.
//
// CHARGING MODE per item:
//   one-time  : charged once, in the FIRST ticked quarter
//   recurring : charged in EVERY ticked quarter (e.g. Internet Allowance)
//
// PRICES VARY BY QUARTER: each item has Q1..Q4 unit prices (stored USD).
// Money stored USD, displayed via f$() so the $/Rs. toggle works.
// ════════════════════════════════════════════════════════════════
(function () {

  var ITEMS = [
    { k: 'Books',                  basis: 'ratio',      ratioDefault: 2,  mode: 'one-time' },
    { k: 'Chromebooks',            basis: 'ratio',      ratioDefault: 5,  mode: 'one-time' },
    { k: 'Solar Panels',           basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'Laptops',                basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'USB Drives',             basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'Learning Mats',          basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'Lesson Planners',        basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'Projectors',             basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'Whiteboards',            basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'School Banners',         basis: 'perSchool',  per: 1,           mode: 'one-time' },
    { k: 'Internet Allowance',     basis: 'perSchool',  per: 1,           mode: 'recurring' },
    { k: 'School Bags',            basis: 'perStudent',                   mode: 'one-time' },
    { k: 'Stationery Kits',        basis: 'perStudent',                   mode: 'one-time' },
    { k: 'Assessment Photocopies', basis: 'perStudent',                   mode: 'recurring' }
  ];
  var BY_KEY = {}; ITEMS.forEach(function (i) { BY_KEY[i.k] = i; });
  window.TAKMIL_ITEMS = ITEMS;

  var DEFAULT_PRICE = {
    'Books': 2, 'Chromebooks': 200, 'Solar Panels': 350, 'Laptops': 430,
    'USB Drives': 6, 'Learning Mats': 4, 'Lesson Planners': 3,
    'Projectors': 160, 'Whiteboards': 40, 'School Banners': 25,
    'Internet Allowance': 11, 'School Bags': 5, 'Stationery Kits': 4,
    'Assessment Photocopies': 1
  };

  function D() { return window.D; }
  var ceil = Math.ceil;
  function money(usd) { return (typeof window.f$ === 'function') ? window.f$(usd) : '$' + Math.round(usd).toLocaleString(); }
  function toDisp(u) { return (typeof window.toDisplay === 'function') ? window.toDisplay(u) : u; }
  function fromDisp(v) { return (typeof window.fromDisplay === 'function') ? window.fromDisplay(v) : v; }

  function cfg() {
    var d = D();
    if (!d.itemCfg) d.itemCfg = {};
    var c = d.itemCfg;
    if (!c.ratios) c.ratios = { 'Books': 2, 'Chromebooks': 5 };
    if (!c.prices) c.prices = {};
    if (!c.modes)  c.modes  = {};
    if (!c.perCounts) c.perCounts = {};
    ITEMS.forEach(function (it) {
      if (!Array.isArray(c.prices[it.k])) {
        var p = DEFAULT_PRICE[it.k] || 0;
        c.prices[it.k] = [p, p, p, p];
      }
      if (!c.modes[it.k]) c.modes[it.k] = it.mode || 'one-time';
      if (it.basis === 'perSchool' && c.perCounts[it.k] == null) c.perCounts[it.k] = it.per || 1;
    });
    return c;
  }

  function qtyFor(school, key) {
    var it = BY_KEY[key]; if (!it) return 0;
    var st = +school.students || 0;
    if (it.basis === 'ratio')      { var r = +cfg().ratios[key] || 0; return r > 0 ? ceil(st / r) : 0; }
    if (it.basis === 'perSchool')  return +cfg().perCounts[key] || 1;
    if (it.basis === 'perStudent') return st;
    return 0;
  }
  window.takmilItemQty = qtyFor;

  function qFlags(school, key) {
    if (!school.itemQ) school.itemQ = {};
    if (!Array.isArray(school.itemQ[key])) school.itemQ[key] = [false, false, false, false];
    return school.itemQ[key];
  }
  window.takmilItemFlags = qFlags;

  // cost of one item at one school, for a specific quarter (1-4) or all (0)
  function itemCostQ(school, key, quarter) {
    var c = cfg();
    var prices = c.prices[key] || [0, 0, 0, 0];
    var mode = c.modes[key] || 'one-time';
    var f = qFlags(school, key);
    var qty = qtyFor(school, key);
    if (!qty) return 0;

    if (mode === 'recurring') {
      if (quarter) return f[quarter - 1] ? qty * (+prices[quarter - 1] || 0) : 0;
      return [0, 1, 2, 3].reduce(function (a, i) { return a + (f[i] ? qty * (+prices[i] || 0) : 0); }, 0);
    }
    // one-time: charged only in the FIRST ticked quarter
    var first = -1;
    for (var i = 0; i < 4; i++) { if (f[i]) { first = i; break; } }
    if (first < 0) return 0;
    if (quarter) return (quarter - 1 === first) ? qty * (+prices[first] || 0) : 0;
    return qty * (+prices[first] || 0);
  }
  window.takmilItemCostQ = itemCostQ;

  function schoolItemCost(school, quarter) {
    return ITEMS.reduce(function (a, it) { return a + itemCostQ(school, it.k, quarter); }, 0);
  }
  window.takmilSchoolItemCost = schoolItemCost;

  function totalItemCost(quarter) {
    return (D().schoolsList || []).reduce(function (a, s) { return a + schoolItemCost(s, quarter); }, 0);
  }
  window.takmilTotalItemCost = totalItemCost;

  function save() { if (typeof window.scheduleSave === 'function') window.scheduleSave(); }

  function hookPersist() {
    if (window.serializeD && !window.serializeD.__itemsWrapped) {
      var os = window.serializeD;
      window.serializeD = function () {
        var out = os.apply(this, arguments);
        try {
          out.itemCfg = JSON.parse(JSON.stringify(cfg()));
          if (Array.isArray(out.schoolsList)) {
            out.schoolsList.forEach(function (row, i) {
              var live = D().schoolsList[i];
              if (live && live.itemQ) row.itemQ = JSON.parse(JSON.stringify(live.itemQ));
            });
          }
        } catch (e) {}
        return out;
      };
      window.serializeD.__itemsWrapped = true;
    }
    if (window.restoreD && !window.restoreD.__itemsWrapped) {
      var or = window.restoreD;
      window.restoreD = function (saved) {
        or.apply(this, arguments);
        try {
          if (saved && saved.itemCfg) D().itemCfg = saved.itemCfg;
          if (saved && Array.isArray(saved.schoolsList)) {
            saved.schoolsList.forEach(function (row, i) {
              if (row.itemQ && D().schoolsList[i]) D().schoolsList[i].itemQ = row.itemQ;
            });
          }
        } catch (e) {}
      };
      window.restoreD.__itemsWrapped = true;
    }
  }

  var VIEW_Q = 0; // 0 = full year, 1..4 = that quarter

  function buildSection() {
    return '<div class="card" id="school-items-card" style="margin-top:14px">' +
      '<div class="card-header"><div class="card-title"><i class="ti ti-package"></i>Items, timing &amp; costs</div>' +
      '<div class="card-actions"><span id="si-grand" style="font-size:12px;color:var(--text2)"></span></div></div>' +
      '<div class="card-body">' +
      '<div class="si-grp">Quantity rules</div><div id="si-ratios" class="si-ratios"></div>' +
      '<details style="margin-top:10px"><summary class="si-sum">Unit prices by quarter, charging mode &amp; per-school counts</summary>' +
      '<div style="overflow-x:auto"><table class="si-ptbl"><thead><tr>' +
      '<th style="text-align:left">Item</th><th>Quantity rule</th><th>Charging</th>' +
      '<th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th>' +
      '</tr></thead><tbody id="si-prices"></tbody></table></div></details>' +
      '<div class="si-grp" style="margin-top:14px">Delivery timing per school ' +
      '<span class="si-qsel">View: ' +
      [0,1,2,3,4].map(function(q){return '<button class="si-qbtn'+(q===0?' on':'')+'" data-vq="'+q+'">'+(q?'Q'+q:'Year')+'</button>';}).join('') +
      '</span></div>' +
      '<div style="overflow-x:auto"><table class="si-table"><thead id="si-head"></thead><tbody id="si-body"></tbody></table></div>' +
      '<p class="si-note">Tick the quarter(s) each school receives an item. Quantities come from the rules above and update with student numbers. ' +
      'One-time items are charged in the first ticked quarter; recurring items are charged in every ticked quarter.</p>' +
      '</div></div>';
  }

  function renderRatios() {
    var c = cfg();
    var html = ITEMS.filter(function (i) { return i.basis === 'ratio'; }).map(function (it) {
      var label = it.k === 'Books' ? 'Students per Book set' : 'Students per ' + it.k.replace(/s$/, '');
      return '<label class="si-ratio"><span>' + label + '</span>' +
        '<input type="number" min="0.1" step="0.1" value="' + (c.ratios[it.k] || it.ratioDefault) + '" data-ratio="' + it.k + '">' +
        '<em>qty = students \u00f7 this, rounded up</em></label>';
    }).join('');
    html += '<div class="si-fixed"><b>Per student:</b> ' +
      ITEMS.filter(function (i) { return i.basis === 'perStudent'; }).map(function (i) { return i.k; }).join(', ') +
      '<br><b>Per school:</b> ' +
      ITEMS.filter(function (i) { return i.basis === 'perSchool'; }).map(function (i) { return i.k; }).join(', ') +
      ' (counts editable in the prices panel)</div>';
    var e = document.getElementById('si-ratios'); if (e) e.innerHTML = html;
    document.querySelectorAll('[data-ratio]').forEach(function (inp) {
      inp.onchange = function () { cfg().ratios[inp.dataset.ratio] = +inp.value || 0; renderAll(); save(); };
    });
  }

  function renderPrices() {
    var c = cfg();
    var rows = ITEMS.map(function (it) {
      var p = c.prices[it.k];
      var ruleCell = it.basis === 'ratio'
        ? '<td style="font-size:10px;color:var(--text3)">students \u00f7 ' + (c.ratios[it.k] || '?') + '</td>'
        : it.basis === 'perStudent'
          ? '<td style="font-size:10px;color:var(--text3)">1 per student</td>'
          : '<td><input type="number" min="0" step="1" style="width:52px" value="' + (c.perCounts[it.k] || 1) + '" data-percount="' + it.k + '"> per school</td>';
      var modeCell = '<td><select data-mode="' + it.k + '">' +
        ['one-time', 'recurring'].map(function (m) {
          return '<option value="' + m + '"' + (c.modes[it.k] === m ? ' selected' : '') + '>' + m + '</option>';
        }).join('') + '</select></td>';
      var priceCells = [0, 1, 2, 3].map(function (qi) {
        return '<td><input type="number" min="0" step="1" value="' + Math.round(toDisp(p[qi] || 0)) +
          '" data-price="' + it.k + '" data-q="' + qi + '" style="width:78px"></td>';
      }).join('');
      return '<tr><td style="text-align:left">' + it.k + '</td>' + ruleCell + modeCell + priceCells + '</tr>';
    }).join('');
    var e = document.getElementById('si-prices'); if (e) e.innerHTML = rows;

    document.querySelectorAll('[data-price]').forEach(function (inp) {
      inp.onchange = function () { cfg().prices[inp.dataset.price][+inp.dataset.q] = fromDisp(+inp.value || 0); renderTable(); save(); };
    });
    document.querySelectorAll('[data-mode]').forEach(function (sel) {
      sel.onchange = function () { cfg().modes[sel.dataset.mode] = sel.value; renderTable(); save(); };
    });
    document.querySelectorAll('[data-percount]').forEach(function (inp) {
      inp.onchange = function () { cfg().perCounts[inp.dataset.percount] = +inp.value || 1; renderAll(); save(); };
    });
  }

  function renderTable() {
    var list = D().schoolsList || [];
    var head = '<tr><th class="si-sticky" style="text-align:left">School</th><th>Stu</th>' +
      ITEMS.map(function (i) { return '<th colspan="4" title="' + i.k + '">' + shortName(i.k) + '</th>'; }).join('') +
      '<th>' + (VIEW_Q ? 'Q' + VIEW_Q + ' cost' : 'Year cost') + '</th></tr>' +
      '<tr><th class="si-sticky"></th><th></th>' +
      ITEMS.map(function () { return '<th class="si-sub">1</th><th class="si-sub">2</th><th class="si-sub">3</th><th class="si-sub">4</th>'; }).join('') +
      '<th></th></tr>';
    var he = document.getElementById('si-head'); if (he) he.innerHTML = head;

    var body = list.map(function (s) {
      var cells = ITEMS.map(function (i) {
        var f = qFlags(s, i.k);
        var q = qtyFor(s, i.k);
        return [0, 1, 2, 3].map(function (qi) {
          var hi = (VIEW_Q && VIEW_Q - 1 === qi) ? ' si-hl' : '';
          return '<td class="' + hi + '"><input type="checkbox" title="' + i.k + ' qty ' + q + '" data-sid="' + s.id +
            '" data-yn="' + i.k + '" data-q="' + qi + '"' + (f[qi] ? ' checked' : '') + '></td>';
        }).join('');
      }).join('');
      return '<tr><td class="si-sticky" style="text-align:left;white-space:nowrap">' + (s.name || '\u2014') + '</td>' +
        '<td>' + (s.students || 0) + '</td>' + cells +
        '<td class="si-cost" data-sid="' + s.id + '" style="white-space:nowrap;font-weight:500">' +
        money(schoolItemCost(s, VIEW_Q)) + '</td></tr>';
    }).join('');
    var be = document.getElementById('si-body'); if (be) be.innerHTML = body;

    document.querySelectorAll('[data-yn]').forEach(function (chk) {
      chk.onchange = function () {
        var s = D().schoolsList.find(function (x) { return x.id == chk.dataset.sid; });
        if (!s) return;
        qFlags(s, chk.dataset.yn)[+chk.dataset.q] = chk.checked;
        renderTable(); save();
      };
    });
    updGrand();
  }

  function updGrand() {
    var g = document.getElementById('si-grand');
    if (!g) return;
    var label = VIEW_Q ? 'Q' + VIEW_Q : 'Full year';
    g.textContent = label + ' items cost: ' + money(totalItemCost(VIEW_Q)) +
      (VIEW_Q ? '  ·  year ' + money(totalItemCost(0)) : '');
  }

  function shortName(k) {
    var m = { 'Chromebooks': 'Chrome', 'Solar Panels': 'Solar', 'Laptops': 'Laptop', 'USB Drives': 'USB',
      'Learning Mats': 'Mats', 'Lesson Planners': 'Planner', 'Books': 'Books', 'School Bags': 'Bags',
      'Stationery Kits': 'Stationery', 'Assessment Photocopies': 'Assess', 'Projectors': 'Projector',
      'Whiteboards': 'W.board', 'School Banners': 'Banner', 'Internet Allowance': 'Internet' };
    return m[k] || k;
  }

  function renderAll() { renderRatios(); renderPrices(); renderTable(); wireQBtns(); }
  window.takmilRenderItems = renderAll;

  function wireQBtns() {
    document.querySelectorAll('[data-vq]').forEach(function (b) {
      b.onclick = function () {
        VIEW_Q = +b.dataset.vq;
        document.querySelectorAll('[data-vq]').forEach(function (x) { x.classList.toggle('on', +x.dataset.vq === VIEW_Q); });
        renderTable();
      };
    });
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.si-grp{font-size:12px;font-weight:600;color:var(--accent);margin:4px 0 8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
      '.si-sum{cursor:pointer;font-size:12px;color:var(--accent);padding:4px 0}' +
      '.si-ratios{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}' +
      '.si-ratio{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text2)}' +
      '.si-ratio input{width:120px}.si-ratio em{font-size:10px;color:var(--text3);font-style:normal}' +
      '.si-fixed{font-size:11px;color:var(--text3);line-height:1.7;flex:1;min-width:240px}' +
      '.si-qsel{font-size:11px;font-weight:400;color:var(--text3);display:flex;gap:4px;align-items:center}' +
      '.si-qbtn{background:var(--bg3);border:.5px solid var(--border2);color:var(--text2);border-radius:5px;padding:2px 9px;font-size:11px;cursor:pointer}' +
      '.si-qbtn.on{background:var(--accent);color:#fff;border-color:var(--accent)}' +
      '.si-ptbl{border-collapse:collapse;font-size:11px;margin-top:6px}' +
      '.si-ptbl th,.si-ptbl td{border:.5px solid var(--border);padding:3px 6px;text-align:center}' +
      '.si-ptbl th{background:var(--bg3);color:var(--text2);font-size:10px}' +
      '.si-table{border-collapse:collapse;font-size:11px;min-width:100%}' +
      '.si-table th,.si-table td{border:.5px solid var(--border);padding:2px 4px;text-align:center}' +
      '.si-table th{background:var(--bg3);color:var(--text2);font-weight:600;font-size:10px;white-space:nowrap}' +
      '.si-sub{font-size:9px!important;color:var(--text3)!important;font-weight:400!important}' +
      '.si-sticky{position:sticky;left:0;background:var(--bg2);z-index:1}' +
      '.si-hl{background:rgba(16,185,129,.10)}' +
      '.si-note{font-size:11px;color:var(--text3);margin:8px 0 0;line-height:1.6}';
    document.head.appendChild(s);
  }

  function inject() {
    var page = document.getElementById('page-schools');
    if (!page || document.getElementById('school-items-card')) return;
    var w = document.createElement('div');
    w.innerHTML = buildSection();
    page.appendChild(w.firstChild);
    renderAll();

    if (window.showPage && !window.showPage.__itemsWrapped) {
      var o = window.showPage;
      window.showPage = function (pg) { var r = o.apply(this, arguments); if (pg === 'schools') setTimeout(renderAll, 30); return r; };
      window.showPage.__itemsWrapped = true;
    }
    if (window.renderSchools && !window.renderSchools.__itemsWrapped) {
      var o2 = window.renderSchools;
      window.renderSchools = function () { var r = o2.apply(this, arguments); setTimeout(renderAll, 30); return r; };
      window.renderSchools.__itemsWrapped = true;
    }
    if (window.setCurrency && !window.setCurrency.__itemsWrapped) {
      var o3 = window.setCurrency;
      window.setCurrency = function () { var r = o3.apply(this, arguments); setTimeout(renderAll, 20); return r; };
      window.setCurrency.__itemsWrapped = true;
    }
  }

  function boot() {
    var t = 0;
    var iv = setInterval(function () {
      t++; hookPersist();
      if (window.D && document.getElementById('page-schools') && !document.getElementById('school-items-card')) {
        injectStyles(); inject(); clearInterval(iv);
      }
      if (t > 80) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
