// ════════════════════════════════════════════════════════════════
// takmil-schoolitems.js — per-school item quantities & costs.
//
// QUANTITIES ARE DERIVED, never typed per school:
//   ratio      : qty = ceil(students / ratio)   Books, Chromebooks
//   perSchool  : qty = 1 per school             Laptops, USB Drives,
//                                               Learning Mats, Lesson Planners
//   perStudent : qty = students                 School Bags, Stationery Kits,
//                                               Assessment Photocopies
//   yesno      : set per quarter, charged ONCE per year if Yes in any
//                quarter                        Projectors, Whiteboards,
//                                               School Banners, Internet Allowance
//
// PRICES VARY BY QUARTER: every item has Q1..Q4 unit prices (stored USD).
//   quantity items -> qty x price of their delivery quarter
//   yes/no items   -> charged once at the price of the FIRST Yes quarter
//
// Money is stored in USD like the rest of the app and shown through f$()
// so the $/Rs. toggle works everywhere.
// ════════════════════════════════════════════════════════════════
(function () {

  var ITEMS = [
    { k: 'Books',                  basis: 'ratio',      ratioDefault: 2 },
    { k: 'Chromebooks',            basis: 'ratio',      ratioDefault: 5 },
    { k: 'Laptops',                basis: 'perSchool',  per: 1 },
    { k: 'USB Drives',             basis: 'perSchool',  per: 1 },
    { k: 'Learning Mats',          basis: 'perSchool',  per: 1 },
    { k: 'Lesson Planners',        basis: 'perSchool',  per: 1 },
    { k: 'School Bags',            basis: 'perStudent' },
    { k: 'Stationery Kits',        basis: 'perStudent' },
    { k: 'Assessment Photocopies', basis: 'perStudent' },
    { k: 'Projectors',             basis: 'yesno' },
    { k: 'Whiteboards',            basis: 'yesno' },
    { k: 'School Banners',         basis: 'yesno' },
    { k: 'Internet Allowance',     basis: 'yesno' }
  ];
  var BY_KEY = {}; ITEMS.forEach(function (i) { BY_KEY[i.k] = i; });
  window.TAKMIL_ITEMS = ITEMS;

  var DEFAULT_PRICE = {
    'Books': 2, 'Chromebooks': 200, 'Laptops': 430, 'USB Drives': 6,
    'Learning Mats': 4, 'Lesson Planners': 3, 'School Bags': 5,
    'Stationery Kits': 4, 'Assessment Photocopies': 1, 'Projectors': 160,
    'Whiteboards': 40, 'School Banners': 25, 'Internet Allowance': 11
  };

  function D() { return window.D; }
  var ceil = Math.ceil;
  function money(usd) { return (typeof window.f$ === 'function') ? window.f$(usd) : '$' + Math.round(usd).toLocaleString(); }
  function toDisp(usd) { return (typeof window.toDisplay === 'function') ? window.toDisplay(usd) : usd; }
  function fromDisp(v) { return (typeof window.fromDisplay === 'function') ? window.fromDisplay(v) : v; }
  function curUnit() { try { return (window.CUR && window.CUR.mode === 'pkr') ? 'Rs.' : '$'; } catch (e) { return '$'; } }

  function cfg() {
    var d = D();
    if (!d.itemCfg) d.itemCfg = {};
    var c = d.itemCfg;
    if (!c.ratios) c.ratios = { 'Books': 2, 'Chromebooks': 5 };
    if (!c.prices) c.prices = {};
    ITEMS.forEach(function (it) {
      if (!Array.isArray(c.prices[it.k])) {
        var p = DEFAULT_PRICE[it.k] || 0;
        c.prices[it.k] = [p, p, p, p];
      }
    });
    if (!c.deliverQ) c.deliverQ = {};
    ITEMS.forEach(function (it) { if (it.basis !== 'yesno' && !c.deliverQ[it.k]) c.deliverQ[it.k] = 1; });
    return c;
  }

  function qtyFor(school, itemKey) {
    var it = BY_KEY[itemKey]; if (!it) return 0;
    var st = +school.students || 0;
    if (it.basis === 'ratio') {
      var r = +cfg().ratios[itemKey] || 0;
      return r > 0 ? ceil(st / r) : 0;
    }
    if (it.basis === 'perSchool') return it.per || 1;
    if (it.basis === 'perStudent') return st;
    return 0;
  }
  window.takmilItemQty = qtyFor;

  function qFlags(school, itemKey) {
    if (!school.itemQ) school.itemQ = {};
    if (!Array.isArray(school.itemQ[itemKey])) school.itemQ[itemKey] = [false, false, false, false];
    return school.itemQ[itemKey];
  }
  function firstYesQuarter(school, itemKey) {
    var f = qFlags(school, itemKey);
    for (var i = 0; i < 4; i++) if (f[i]) return i + 1;
    return 0;
  }

  function itemCost(school, itemKey) {
    var it = BY_KEY[itemKey]; if (!it) return 0;
    var c = cfg();
    var prices = c.prices[itemKey] || [0, 0, 0, 0];
    if (it.basis === 'yesno') {
      var q = firstYesQuarter(school, itemKey);
      return q ? (+prices[q - 1] || 0) : 0;
    }
    var dq = +c.deliverQ[itemKey] || 1;
    return qtyFor(school, itemKey) * (+prices[dq - 1] || 0);
  }
  window.takmilItemCost = itemCost;

  function schoolItemCost(school) {
    return ITEMS.reduce(function (a, it) { return a + itemCost(school, it.k); }, 0);
  }
  window.takmilSchoolItemCost = schoolItemCost;

  function totalItemCost() {
    return (D().schoolsList || []).reduce(function (a, s) { return a + schoolItemCost(s); }, 0);
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

  function buildSection() {
    return '<div class="card" id="school-items-card" style="margin-top:14px">' +
      '<div class="card-header"><div class="card-title"><i class="ti ti-package"></i>Items &amp; costs</div>' +
      '<div class="card-actions"><span id="si-grand" style="font-size:12px;color:var(--text2)"></span></div></div>' +
      '<div class="card-body">' +
      '<div class="si-grp">Quantity rules</div>' +
      '<div id="si-ratios" class="si-ratios"></div>' +
      '<details style="margin-top:10px"><summary class="si-sum">Unit prices by quarter &amp; delivery quarter</summary>' +
      '<div style="overflow-x:auto"><table class="si-ptbl"><thead><tr>' +
      '<th style="text-align:left">Item</th><th>Basis</th>' +
      '<th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Delivered</th>' +
      '</tr></thead><tbody id="si-prices"></tbody></table></div></details>' +
      '<div class="si-grp" style="margin-top:14px">Per-school quantities &amp; cost</div>' +
      '<div style="overflow-x:auto"><table class="si-table"><thead id="si-head"></thead><tbody id="si-body"></tbody></table></div>' +
      '<p class="si-note">Quantities are calculated from each school\u2019s student count and update automatically. Only the four yes/no items are set per school, by quarter.</p>' +
      '</div></div>';
  }

  function renderRatios() {
    var c = cfg();
    var html = ITEMS.filter(function (i) { return i.basis === 'ratio'; }).map(function (it) {
      var label = it.k === 'Books' ? 'Students per Book set' : 'Students per Chromebook';
      return '<label class="si-ratio"><span>' + label + '</span>' +
        '<input type="number" min="0.1" step="0.1" value="' + (c.ratios[it.k] || it.ratioDefault) + '" data-ratio="' + it.k + '">' +
        '<em>qty = students \u00f7 this, rounded up</em></label>';
    }).join('');
    html += '<div class="si-fixed"><b>Fixed rules:</b> ' +
      ITEMS.filter(function (i) { return i.basis === 'perSchool'; }).map(function (i) { return i.k; }).join(', ') +
      ' = 1 per school \u00b7 ' +
      ITEMS.filter(function (i) { return i.basis === 'perStudent'; }).map(function (i) { return i.k; }).join(', ') +
      ' = 1 per student</div>';
    var e = document.getElementById('si-ratios'); if (e) e.innerHTML = html;
    document.querySelectorAll('[data-ratio]').forEach(function (inp) {
      inp.onchange = function () { cfg().ratios[inp.dataset.ratio] = +inp.value || 0; renderAll(); save(); };
    });
  }

  function renderPrices() {
    var c = cfg();
    var basisLabel = { ratio: 'ratio', perSchool: 'per school', perStudent: 'per student', yesno: 'yes/no' };
    var rows = ITEMS.map(function (it) {
      var p = c.prices[it.k];
      var cells = [0, 1, 2, 3].map(function (qi) {
        return '<td><input type="number" min="0" step="1" value="' + Math.round(toDisp(p[qi] || 0)) +
          '" data-price="' + it.k + '" data-q="' + qi + '" style="width:78px"></td>';
      }).join('');
      var deliver = it.basis === 'yesno'
        ? '<td style="color:var(--text3);font-size:10px">first Yes quarter</td>'
        : '<td><select data-deliver="' + it.k + '">' + [1, 2, 3, 4].map(function (q) {
            return '<option value="' + q + '"' + ((+c.deliverQ[it.k] === q) ? ' selected' : '') + '>Q' + q + '</option>';
          }).join('') + '</select></td>';
      return '<tr><td style="text-align:left">' + it.k + '</td>' +
        '<td style="font-size:10px;color:var(--text3)">' + basisLabel[it.basis] + '</td>' + cells + deliver + '</tr>';
    }).join('');
    var e = document.getElementById('si-prices'); if (e) e.innerHTML = rows;

    document.querySelectorAll('[data-price]').forEach(function (inp) {
      inp.onchange = function () {
        cfg().prices[inp.dataset.price][+inp.dataset.q] = fromDisp(+inp.value || 0);
        renderTable(); save();
      };
    });
    document.querySelectorAll('[data-deliver]').forEach(function (sel) {
      sel.onchange = function () { cfg().deliverQ[sel.dataset.deliver] = +sel.value; renderTable(); save(); };
    });
  }

  function renderTable() {
    var list = D().schoolsList || [];
    var qtyItems = ITEMS.filter(function (i) { return i.basis !== 'yesno'; });
    var ynItems = ITEMS.filter(function (i) { return i.basis === 'yesno'; });

    var head = '<tr><th class="si-sticky" style="text-align:left">School</th><th>Students</th>' +
      qtyItems.map(function (i) { return '<th title="' + i.k + '">' + shortName(i.k) + '</th>'; }).join('') +
      ynItems.map(function (i) { return '<th colspan="4" title="' + i.k + '">' + shortName(i.k) + '</th>'; }).join('') +
      '<th>Cost</th></tr>' +
      '<tr><th class="si-sticky"></th><th></th>' +
      qtyItems.map(function () { return '<th class="si-sub">qty</th>'; }).join('') +
      ynItems.map(function () { return '<th class="si-sub">1</th><th class="si-sub">2</th><th class="si-sub">3</th><th class="si-sub">4</th>'; }).join('') +
      '<th></th></tr>';
    var he = document.getElementById('si-head'); if (he) he.innerHTML = head;

    var body = list.map(function (s) {
      var qtyCells = qtyItems.map(function (i) {
        return '<td class="si-qty">' + qtyFor(s, i.k).toLocaleString() + '</td>';
      }).join('');
      var ynCells = ynItems.map(function (i) {
        var f = qFlags(s, i.k);
        return [0, 1, 2, 3].map(function (qi) {
          return '<td><input type="checkbox" data-sid="' + s.id + '" data-yn="' + i.k + '" data-q="' + qi + '"' +
            (f[qi] ? ' checked' : '') + '></td>';
        }).join('');
      }).join('');
      return '<tr><td class="si-sticky" style="text-align:left;white-space:nowrap">' + (s.name || '\u2014') + '</td>' +
        '<td>' + (s.students || 0) + '</td>' + qtyCells + ynCells +
        '<td class="si-cost" data-sid="' + s.id + '" style="white-space:nowrap;font-weight:500">' + money(schoolItemCost(s)) + '</td></tr>';
    }).join('');
    var be = document.getElementById('si-body'); if (be) be.innerHTML = body;

    document.querySelectorAll('[data-yn]').forEach(function (chk) {
      chk.onchange = function () {
        var s = D().schoolsList.find(function (x) { return x.id == chk.dataset.sid; });
        if (!s) return;
        qFlags(s, chk.dataset.yn)[+chk.dataset.q] = chk.checked;
        var cell = document.querySelector('.si-cost[data-sid="' + s.id + '"]');
        if (cell) cell.textContent = money(schoolItemCost(s));
        updGrand(); save();
      };
    });
    updGrand();
  }

  function updGrand() {
    var g = document.getElementById('si-grand');
    if (g) g.textContent = 'Total items cost: ' + money(totalItemCost());
  }

  function shortName(k) {
    var m = { 'Chromebooks': 'Chrome', 'Laptops': 'Laptop', 'USB Drives': 'USB', 'Learning Mats': 'Mats',
      'Lesson Planners': 'Planners', 'Books': 'Books', 'School Bags': 'Bags', 'Stationery Kits': 'Stationery',
      'Assessment Photocopies': 'Assess', 'Projectors': 'Projector', 'Whiteboards': 'W.board',
      'School Banners': 'Banner', 'Internet Allowance': 'Internet' };
    return m[k] || k;
  }

  function renderAll() { renderRatios(); renderPrices(); renderTable(); }
  window.takmilRenderItems = renderAll;

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.si-grp{font-size:12px;font-weight:600;color:var(--accent);margin:4px 0 8px}' +
      '.si-sum{cursor:pointer;font-size:12px;color:var(--accent);padding:4px 0}' +
      '.si-ratios{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}' +
      '.si-ratio{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text2)}' +
      '.si-ratio input{width:120px}.si-ratio em{font-size:10px;color:var(--text3);font-style:normal}' +
      '.si-fixed{font-size:11px;color:var(--text3);line-height:1.6;flex:1;min-width:240px}' +
      '.si-ptbl{border-collapse:collapse;font-size:11px;margin-top:6px}' +
      '.si-ptbl th,.si-ptbl td{border:.5px solid var(--border);padding:3px 6px;text-align:center}' +
      '.si-ptbl th{background:var(--bg3);color:var(--text2);font-size:10px}' +
      '.si-table{border-collapse:collapse;font-size:11px;min-width:100%}' +
      '.si-table th,.si-table td{border:.5px solid var(--border);padding:3px 5px;text-align:center}' +
      '.si-table th{background:var(--bg3);color:var(--text2);font-weight:600;font-size:10px;white-space:nowrap}' +
      '.si-sub{font-size:9px!important;color:var(--text3)!important;font-weight:400!important}' +
      '.si-sticky{position:sticky;left:0;background:var(--bg2);z-index:1}' +
      '.si-qty{color:var(--text2)}' +
      '.si-note{font-size:11px;color:var(--text3);margin:8px 0 0;line-height:1.5}';
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
