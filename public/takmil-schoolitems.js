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
    { k: 'Books',                  basis: 'ratio',      ratioDefault: 2,  freq: 'annual'  },
    { k: 'Chromebooks',            basis: 'perSchool',  per: 5,           freq: 'annual'  },
    { k: 'Solar Panels',           basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'Laptops',                basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'USB Drives',             basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'Learning Mats',          basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'Lesson Planners',        basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'Projectors',             basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'Whiteboards',            basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'School Banners',         basis: 'perSchool',  per: 1,           freq: 'annual'  },
    { k: 'School Bags',            basis: 'perStudent',                   freq: 'annual'  },
    { k: 'Internet Allowance',     basis: 'perSchool',  per: 1,           freq: 'monthly' },
    { k: 'Stationery Kits',        basis: 'perStudent',                   freq: 'monthly' },
    { k: 'Assessment Photocopies', basis: 'perStudent',                   freq: 'monthly' }
  ];
  var MONTHS_PER_QUARTER = 3;
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
    if (!c.ratios) c.ratios = { 'Books': 2 };
    if (c.ratios['Books'] == null) c.ratios['Books'] = 2;
    if (!c.perCounts) c.perCounts = {};
    if (!c.prices) c.prices = {};
    if (!c.freq)   c.freq   = {};
    ITEMS.forEach(function (it) {
      if (!Array.isArray(c.prices[it.k])) {
        var p = DEFAULT_PRICE[it.k] || 0;
        c.prices[it.k] = [p, p, p, p];
      }
      if (!c.freq[it.k]) c.freq[it.k] = it.freq || 'annual';
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

  // cost of one item at one school, for a specific quarter (1-4) or full year (0)
  function itemCostQ(school, key, quarter) {
    var c = cfg();
    var prices = c.prices[key] || [0, 0, 0, 0];
    var freq = c.freq[key] || 'annual';
    var f = qFlags(school, key);
    var qty = qtyFor(school, key);
    if (!qty) return 0;

    if (freq === 'monthly') {
      // charged every ticked quarter, at 3 months × that quarter's price
      if (quarter) return f[quarter - 1] ? qty * (+prices[quarter - 1] || 0) * MONTHS_PER_QUARTER : 0;
      return [0, 1, 2, 3].reduce(function (a, i) {
        return a + (f[i] ? qty * (+prices[i] || 0) * MONTHS_PER_QUARTER : 0);
      }, 0);
    }
    // annual: charged ONCE, in the first ticked (delivery) quarter
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

  // Per-item summary across all schools: how many schools get it, total units, total cost.
  function itemBreakdown(quarter) {
    var list = D().schoolsList || [];
    return ITEMS.map(function (it) {
      var schoolsWith = 0, units = 0, cost = 0;
      list.forEach(function (s) {
        var f = qFlags(s, it.k);
        var gets = Array.isArray(f) && f.some(Boolean);
        if (gets) { schoolsWith++; units += qtyFor(s, it.k); }
        cost += itemCostQ(s, it.k, quarter);
      });
      return { k: it.k, freq: cfg().freq[it.k], schools: schoolsWith, units: units, cost: cost };
    }).sort(function (a, b) { return b.cost - a.cost; });
  }
  window.takmilItemBreakdown = itemBreakdown;

  // Annual cost of one item for a TYPICAL school (avg students), assuming the
  // item is delivered (full year for monthly items). Used for the Settings
  // "Annual cost/school" column so the number is concrete.
  function annualCostPerSchool(key) {
    var it = BY_KEY[key]; if (!it) return 0;
    var c = cfg();
    var d = D();
    var avgStudents = (d.schools > 0 && d.students) ? Math.round(d.students / d.schools) : (d.students || 30);
    var qty;
    if (it.basis === 'ratio')          qty = Math.max(0, Math.ceil(avgStudents / (+c.ratios[key] || 1)));
    else if (it.basis === 'perSchool') qty = +c.perCounts[key] || 1;
    else                               qty = avgStudents; // perStudent
    var price = (c.prices[key] && c.prices[key][0]) || 0; // Q1 price as the base
    var months = (c.freq[key] === 'monthly') ? 12 : 1;
    return qty * price * months;
  }
  window.takmilAnnualPerSchool = annualCostPerSchool;

  function save() {
    /* Warn if the current user can't actually save (viewer role) — otherwise
       edits silently vanish, which looks like "prices didn't save". */
    try {
      if (window.SESSION && window.SESSION.role === 'viewer') {
        if (typeof window.showPersistToast === 'function')
          window.showPersistToast('\u26a0 You are a viewer — changes are not saved. Ask an admin for editor access.', true);
        return;
      }
    } catch (e) {}
    if (typeof window.scheduleSave === 'function') window.scheduleSave();
    /* Also trigger an immediate save so price edits persist even if the user
       navigates away before the 1.5s debounce fires. */
    if (typeof window.saveToStorage === 'function') {
      try { window.saveToStorage(false); } catch (e) {}
    }
    ['updateKPIs','updateSettingsDerived','renderDashboard'].forEach(function(fn){
      try{ if(typeof window[fn]==='function') window[fn](); }catch(e){}
    });
  }

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
    /* Fix stale-load race: the cloud bridge may have already called restoreD
       (loading the saved doc) BEFORE this module wrapped it — so our saved
       item prices/timing were skipped. If a cloud doc was stashed, re-apply
       our part of it ONCE. */
    if (!hookPersist.__reapplied) {
      try {
        var cd = window.__CLOUD_DOC;
        if (cd) {
          if (cd.itemCfg) D().itemCfg = cd.itemCfg;
          if (Array.isArray(cd.schoolsList)) {
            cd.schoolsList.forEach(function (row, i) {
              if (row.itemQ && D().schoolsList[i]) D().schoolsList[i].itemQ = row.itemQ;
            });
          }
          hookPersist.__reapplied = true;
          // refresh any visible item UI with the restored prices
          setTimeout(function () { try { if (typeof renderAll === 'function') renderAll(); if (typeof renderSettingsPrices === 'function') renderSettingsPrices(); } catch (e) {} }, 100);
        }
      } catch (e) {}
    }
  }

  var BREAK_Q = 0;
  function renderBreakdown() {
    var body = document.getElementById('si-breakdown-body');
    if (!body) return;
    var rows = itemBreakdown(BREAK_Q);
    var grand = rows.reduce(function (a, r) { return a + r.cost; }, 0) || 1;
    var totalSchools = (D().schoolsList || []).length;
    body.innerHTML = rows.map(function (r) {
      var pct = Math.round(r.cost / grand * 100);
      var warn = (r.schools === totalSchools && totalSchools > 0)
        ? ' <span title="Every school is ticked for this item" style="color:var(--amber)">\u26a0 all</span>' : '';
      return '<tr>' +
        '<td style="text-align:left">' + r.k + '</td>' +
        '<td style="font-size:10px;color:var(--text3)">' + (r.freq === 'monthly' ? 'monthly \u00d73' : 'once/yr') + '</td>' +
        '<td>' + r.schools + ' / ' + totalSchools + warn + '</td>' +
        '<td>' + r.units.toLocaleString() + '</td>' +
        '<td style="font-weight:600">' + money(r.cost) + '</td>' +
        '<td>' + pct + '%</td>' +
        '</tr>';
    }).join('') +
      '<tr style="border-top:2px solid var(--border2)"><td style="text-align:left;font-weight:600">TOTAL</td><td></td><td></td><td></td>' +
      '<td style="font-weight:700;color:var(--accent)">' + money(grand) + '</td><td>100%</td></tr>';

    document.querySelectorAll('[data-bq]').forEach(function (b) {
      b.onclick = function () {
        BREAK_Q = +b.dataset.bq;
        document.querySelectorAll('[data-bq]').forEach(function (x) { x.classList.toggle('on', +x.dataset.bq === BREAK_Q); });
        renderBreakdown();
      };
    });
  }

  var VIEW_Q = 0; // 0 = full year, 1..4 = that quarter

  function buildSection() {
    return '<div class="card" id="school-items-card" style="margin-top:14px">' +
      '<div class="card-header"><div class="card-title"><i class="ti ti-package"></i>Items, timing &amp; costs</div>' +
      '<div class="card-actions"><span id="si-grand" style="font-size:12px;color:var(--text2)"></span></div></div>' +
      '<div class="card-body">' +
      '<div class="si-grp" style="margin-top:2px">Cost breakdown by item ' +
      '<span class="si-qsel">View: ' +
      [0,1,2,3,4].map(function(q){return '<button class="si-bqbtn'+(q===0?' on':'')+'" data-bq="'+q+'">'+(q?'Q'+q:'Year')+'</button>';}).join('') +
      '</span></div>' +
      '<div style="overflow-x:auto"><table class="si-ptbl" style="width:100%"><thead><tr>' +
      '<th style="text-align:left">Item</th><th>Frequency</th><th>Schools receiving</th><th>Total units</th><th>Total cost</th><th>% of items</th>' +
      '</tr></thead><tbody id="si-breakdown-body"></tbody></table></div>' +
      '<div class="si-grp" style="margin-top:14px">Delivery timing per school ' +
      '<span class="si-qsel">View: ' +
      [0,1,2,3,4].map(function(q){return '<button class="si-qbtn'+(q===0?' on':'')+'" data-vq="'+q+'">'+(q?'Q'+q:'Year')+'</button>';}).join('') +
      '</span></div>' +
      '<div style="overflow-x:auto"><table class="si-table"><thead id="si-head"></thead><tbody id="si-body"></tbody></table></div>' +
      '<p class="si-note">Tick the quarter(s) each school receives an item. Quantities come from the rules above and update with student numbers. ' +
      'Once/year items are charged once in the delivery quarter you tick. Monthly items (stationery, assessment, internet) are charged 3 months × price for every ticked quarter.</p>' +
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
      var modeCell = '<td><select data-freq="' + it.k + '">' +
        [['annual', 'once/year'], ['monthly', 'monthly ×3/qtr']].map(function (m) {
          return '<option value="' + m[0] + '"' + (c.freq[it.k] === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
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
    document.querySelectorAll('[data-freq]').forEach(function (sel) {
      sel.onchange = function () { cfg().freq[sel.dataset.freq] = sel.value; renderTable(); save(); };
    });
    document.querySelectorAll('[data-percount]').forEach(function (inp) {
      inp.onchange = function () { cfg().perCounts[inp.dataset.percount] = +inp.value || 1; renderAll(); save(); };
    });
  }

  // ── Full item price table for the Programme Settings page ──
  function renderSettingsPrices() {
    var anchor = document.getElementById('si-settings-anchor');
    if (!anchor) return;
    var c = cfg();
    if (!anchor.__built) {
      anchor.innerHTML =
        '<div class="si-set-ratios si-ratios" id="si-set-ratios"></div>' +
        '<div style="overflow-x:auto;margin-top:8px"><table class="si-ptbl" style="width:100%"><thead><tr>' +
        '<th style="text-align:left">Item</th><th>Quantity rule</th><th>Frequency</th>' +
        '<th>Unit price</th><th>Q1 price</th><th>Q2 price</th><th>Q3 price</th><th>Q4 price</th>' +
        '<th style="background:var(--bg2)">Annual cost / school</th>' +
        '</tr></thead><tbody id="si-set-prices"></tbody></table></div>' +
        '<p class="si-note">Once/year items are charged once in the delivery quarter ticked per school. ' +
        'Monthly items (stationery, assessment, internet) charge 3 months \u00d7 price for each ticked quarter. ' +
        'Per-school delivery quarters are set on the Schools page.</p>';
      anchor.__built = true;
    }
    var rHtml = ITEMS.filter(function (i) { return i.basis === 'ratio'; }).map(function (it) {
      return '<label class="si-ratio"><span>Students per ' + (it.k === 'Books' ? 'Book set' : it.k) + '</span>' +
        '<input type="number" min="0.1" step="0.1" value="' + (c.ratios[it.k] || it.ratioDefault) + '" data-sratio="' + it.k + '"></label>';
    }).join('');
    var sr = document.getElementById('si-set-ratios'); if (sr) sr.innerHTML = rHtml;

    var rows = ITEMS.map(function (it) {
      var p = c.prices[it.k];
      var rule = it.basis === 'ratio' ? 'students \u00f7 ' + (c.ratios[it.k] || '?')
        : it.basis === 'perStudent' ? '1 per student' : (c.perCounts[it.k] || 1) + ' per school';
      var ruleCell = it.basis === 'perSchool'
        ? '<td><input type="number" min="0" step="1" style="width:46px" value="' + (c.perCounts[it.k] || 1) + '" data-spercount="' + it.k + '"> /school</td>'
        : '<td style="font-size:10px;color:var(--text3)">' + rule + '</td>';
      var freqCell = '<td><select data-sfreq="' + it.k + '">' +
        [['annual', 'once/year'], ['monthly', 'monthly \u00d73/qtr']].map(function (m) {
          return '<option value="' + m[0] + '"' + (c.freq[it.k] === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
        }).join('') + '</select></td>';
      var priceCells = [0, 1, 2, 3].map(function (qi) {
        return '<td><input type="number" min="0" step="1" value="' + Math.round(toDisp(p[qi] || 0)) +
          '" data-sprice="' + it.k + '" data-q="' + qi + '" style="width:80px"></td>';
      }).join('');
      // Unit price: shows the common value if all quarters equal, else blank.
      var allEqual = p[0] === p[1] && p[1] === p[2] && p[2] === p[3];
      var unitVal = allEqual ? Math.round(toDisp(p[0] || 0)) : '';
      var unitCell = '<td><input type="number" min="0" step="1" value="' + unitVal +
        '" placeholder="\u2013" data-sunit="' + it.k + '" style="width:80px;font-weight:600"></td>';
      var annual = annualCostPerSchool(it.k);
      var qtyNote = it.basis === 'ratio' ? '\u2308stu\u00f7' + (c.ratios[it.k] || '?') + '\u2309'
        : it.basis === 'perStudent' ? 'stu' : (c.perCounts[it.k] || 1);
      var freqNote = c.freq[it.k] === 'monthly' ? ' \u00d712mo' : '';
      var annualCell = '<td style="background:var(--bg2);font-weight:600;white-space:nowrap">' + money(annual) +
        '<div style="font-size:9px;color:var(--text3);font-weight:400">' + qtyNote + '\u00d7price' + freqNote + '</div></td>';
      return '<tr><td style="text-align:left">' + it.k + '</td>' + ruleCell + freqCell + unitCell + priceCells + annualCell + '</tr>';
    }).join('');
    var body = document.getElementById('si-set-prices'); if (body) body.innerHTML = rows;

    anchor.querySelectorAll('[data-sunit]').forEach(function (inp) {
      inp.onchange = function () {
        var usd = fromDisp(+inp.value || 0);
        cfg().prices[inp.dataset.sunit] = [usd, usd, usd, usd]; // fill all four quarters
        refreshEverything();
      };
    });
    anchor.querySelectorAll('[data-sprice]').forEach(function (inp) {
      inp.onchange = function () { cfg().prices[inp.dataset.sprice][+inp.dataset.q] = fromDisp(+inp.value || 0); refreshEverything(); };
    });
    anchor.querySelectorAll('[data-sfreq]').forEach(function (sel) {
      sel.onchange = function () { cfg().freq[sel.dataset.sfreq] = sel.value; refreshEverything(); };
    });
    anchor.querySelectorAll('[data-spercount]').forEach(function (inp) {
      inp.onchange = function () { cfg().perCounts[inp.dataset.spercount] = +inp.value || 1; refreshEverything(); };
    });
    anchor.querySelectorAll('[data-sratio]').forEach(function (inp) {
      inp.onchange = function () { cfg().ratios[inp.dataset.sratio] = +inp.value || 0; refreshEverything(); };
    });
  }

  function refreshEverything() {
    renderSettingsPrices();
    if (document.getElementById('school-items-card')) { try { renderAll(); } catch (e) {} }
    save();
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

  function renderAll() { renderBreakdown(); renderTable(); wireQBtns(); }
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
      '.si-bqbtn{background:var(--bg3);border:.5px solid var(--border2);color:var(--text2);border-radius:5px;padding:2px 9px;font-size:11px;cursor:pointer}' +
      '.si-bqbtn.on{background:var(--accent);color:#fff;border-color:var(--accent)}' +
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
    renderSettingsPrices(); // also fill the Programme Settings price table

    if (window.showPage && !window.showPage.__itemsWrapped) {
      var o = window.showPage;
      window.showPage = function (pg) {
        var r = o.apply(this, arguments);
        if (pg === 'schools') setTimeout(renderAll, 30);
        if (pg === 'settings') setTimeout(renderSettingsPrices, 30);
        return r;
      };
      window.showPage.__itemsWrapped = true;
    }
    if (window.renderSchools && !window.renderSchools.__itemsWrapped) {
      var o2 = window.renderSchools;
      window.renderSchools = function () { var r = o2.apply(this, arguments); setTimeout(renderAll, 30); return r; };
      window.renderSchools.__itemsWrapped = true;
    }
    if (window.setCurrency && !window.setCurrency.__itemsWrapped) {
      var o3 = window.setCurrency;
      window.setCurrency = function () { var r = o3.apply(this, arguments); setTimeout(function(){ renderAll(); renderSettingsPrices(); }, 20); return r; };
      window.setCurrency.__itemsWrapped = true;
    }
  }

  function boot() {
    var t = 0;
    var iv = setInterval(function () {
      t++; hookPersist();
      // Wait for the cloud doc to be applied (or ~6s) before finishing setup,
      // so restored item prices aren't missed on a slow load.
      var cloudSettled = hookPersist.__reapplied || !!window.__CLOUD_DOC || t > 12;
      if (window.D && document.getElementById('page-schools') && !document.getElementById('school-items-card') && cloudSettled) {
        injectStyles(); inject();
        setTimeout(renderSettingsPrices, 50);
        clearInterval(iv);
      }
      if (t > 80) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
