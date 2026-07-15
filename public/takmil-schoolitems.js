// ════════════════════════════════════════════════════════════════
// takmil-schoolitems.js — "Items & costs" for the Schools page.
//
// Adds per-school supply items with quantities (9 items) and yes/no
// flags (4 items), plus an editable unit-price list. Per-school item
// cost = Σ(qty × unit price) for quantity items + (unit price if yes)
// for yes/no items. A new collapsible "Items & costs" section on the
// Schools page shows unit prices (editable) and a per-school cost table.
//
// Item data lives on each school as school.items = { 'Books': 30, ... }.
// Unit prices live at D.itemPrices = { 'Books': 2, ... } and are saved
// with the model (piggy-backing on the existing overhead-style persist
// via a hidden field we add to serializeD is not needed — instead we
// store prices inside D and include them through a small serialize hook).
// ════════════════════════════════════════════════════════════════
(function () {
  var QTY_ITEMS = ['Chromebooks', 'Laptops', 'USB Drives', 'Learning Mats',
    'Lesson Planners', 'Books', 'School Bags', 'Stationery Kits', 'Assessment Photocopies'];
  var YESNO_ITEMS = ['Projectors', 'Whiteboards', 'School Banners', 'Internet Allowance'];
  var ALL_ITEMS = QTY_ITEMS.concat(YESNO_ITEMS);

  var DEFAULT_PRICES = {
    'Chromebooks': 200, 'Laptops': 450, 'USB Drives': 6, 'Learning Mats': 4,
    'Lesson Planners': 3, 'Books': 2, 'School Bags': 5, 'Stationery Kits': 4,
    'Assessment Photocopies': 1, 'Projectors': 300, 'Whiteboards': 40,
    'School Banners': 25, 'Internet Allowance': 120,
  };

  function D() { return window.D; }
  var rnd = function (x) { return Math.round(x); };

  // currency-aware formatting, reusing the app's helper if present
  function money(usd) {
    if (typeof window.f$ === 'function') return window.f$(usd);
    return '$' + rnd(usd).toLocaleString();
  }

  function prices() {
    if (!D().itemPrices) D().itemPrices = Object.assign({}, DEFAULT_PRICES);
    // ensure every item has a price key
    ALL_ITEMS.forEach(function (k) { if (D().itemPrices[k] == null) D().itemPrices[k] = DEFAULT_PRICES[k] || 0; });
    return D().itemPrices;
  }

  // cost of one school's items
  function schoolItemCost(s) {
    var it = s.items || {}, pr = prices(), total = 0;
    QTY_ITEMS.forEach(function (k) { total += (+it[k] || 0) * (+pr[k] || 0); });
    YESNO_ITEMS.forEach(function (k) { if (it[k]) total += (+pr[k] || 0); });
    return total;
  }
  window.takmilSchoolItemCost = schoolItemCost;

  function totalItemCost() {
    return (D().schoolsList || []).reduce(function (a, s) { return a + schoolItemCost(s); }, 0);
  }
  window.takmilTotalItemCost = totalItemCost;

  function save() {
    if (typeof window.scheduleSave === 'function') window.scheduleSave();
  }

  // ── persist itemPrices through serializeD/restoreD ──
  function hookPersist() {
    if (window.serializeD && !window.serializeD.__itemsWrapped) {
      var origSer = window.serializeD;
      window.serializeD = function () {
        var out = origSer.apply(this, arguments);
        try { out.itemPrices = Object.assign({}, prices()); } catch (e) {}
        return out;
      };
      window.serializeD.__itemsWrapped = true;
    }
    if (window.restoreD && !window.restoreD.__itemsWrapped) {
      var origRes = window.restoreD;
      window.restoreD = function (saved) {
        origRes.apply(this, arguments);
        try { if (saved && saved.itemPrices) D().itemPrices = Object.assign({}, DEFAULT_PRICES, saved.itemPrices); } catch (e) {}
        return;
      };
      window.restoreD.__itemsWrapped = true;
    }
  }

  // ── the Items & costs section, injected into the Schools page ──
  function buildSection() {
    var pr = prices();
    var priceInputs = ALL_ITEMS.map(function (k) {
      var isYN = YESNO_ITEMS.indexOf(k) >= 0;
      return '<div class="si-price">' +
        '<span class="si-name">' + k + (isYN ? ' <em>(yes/no)</em>' : '') + '</span>' +
        '<span class="si-unit">' + money(1).replace(/[\d.,]+/, '') + '<input type="number" min="0" step="1" ' +
        'value="' + (pr[k] || 0) + '" data-item="' + k + '" class="si-price-in"></span>' +
        '</div>';
    }).join('');

    return '<div class="card" id="school-items-card" style="margin-top:14px">' +
      '<div class="card-header"><div class="card-title"><i class="ti ti-package"></i>Items &amp; costs (per school)</div>' +
      '<div class="card-actions"><span id="si-grand" style="font-size:12px;color:var(--text2)"></span></div></div>' +
      '<div class="card-body">' +
      '<details><summary style="cursor:pointer;font-size:12px;color:var(--accent);padding:4px 0 10px">Unit prices — edit once, applied to every school</summary>' +
      '<div class="si-prices">' + priceInputs + '</div></details>' +
      '<div style="overflow-x:auto"><table class="si-table"><thead id="si-head"></thead><tbody id="si-body"></tbody></table></div>' +
      '</div></div>';
  }

  function renderSection() {
    var card = document.getElementById('school-items-card');
    if (!card) return;
    var pr = prices();

    // header: school + each item + total
    var head = '<tr><th style="text-align:left;position:sticky;left:0;background:var(--bg2)">School</th>' +
      ALL_ITEMS.map(function (k) {
        var isYN = YESNO_ITEMS.indexOf(k) >= 0;
        return '<th title="' + k + (isYN ? ' (yes/no)' : ' (qty)') + '">' + shortName(k) + '</th>';
      }).join('') + '<th>Item cost</th></tr>';
    var he = document.getElementById('si-head'); if (he) he.innerHTML = head;

    var list = D().schoolsList || [];
    var body = list.map(function (s) {
      var it = s.items || (s.items = {});
      var cells = ALL_ITEMS.map(function (k) {
        if (YESNO_ITEMS.indexOf(k) >= 0) {
          return '<td style="text-align:center"><input type="checkbox" data-sid="' + s.id + '" data-item="' + k + '"' +
            (it[k] ? ' checked' : '') + ' class="si-yn"></td>';
        }
        return '<td><input type="number" min="0" step="1" value="' + (it[k] || 0) + '" ' +
          'data-sid="' + s.id + '" data-item="' + k + '" class="si-qty" style="width:56px"></td>';
      }).join('');
      return '<tr><td style="text-align:left;position:sticky;left:0;background:var(--bg2);white-space:nowrap">' +
        (s.name || '—') + '</td>' + cells +
        '<td class="si-cost" data-sid="' + s.id + '" style="white-space:nowrap;font-weight:500">' + money(schoolItemCost(s)) + '</td></tr>';
    }).join('');
    var be = document.getElementById('si-body'); if (be) be.innerHTML = body;

    var grand = document.getElementById('si-grand');
    if (grand) grand.textContent = 'Total items cost: ' + money(totalItemCost());

    wireSection();
  }

  function shortName(k) {
    var map = {
      'Chromebooks': 'Chrome', 'Laptops': 'Laptop', 'USB Drives': 'USB', 'Learning Mats': 'Mats',
      'Lesson Planners': 'Planners', 'Books': 'Books', 'School Bags': 'Bags', 'Stationery Kits': 'Stationery',
      'Assessment Photocopies': 'Assess', 'Projectors': 'Projector', 'Whiteboards': 'W.board',
      'School Banners': 'Banner', 'Internet Allowance': 'Internet',
    };
    return map[k] || k;
  }

  var wired = false;
  function wireSection() {
    // price inputs
    document.querySelectorAll('.si-price-in').forEach(function (inp) {
      inp.onchange = function () {
        prices()[inp.dataset.item] = +inp.value || 0;
        renderSection(); save();
      };
    });
    // quantity inputs
    document.querySelectorAll('.si-qty').forEach(function (inp) {
      inp.onchange = function () {
        var s = D().schoolsList.find(function (x) { return x.id == inp.dataset.sid; });
        if (!s) return; if (!s.items) s.items = {};
        var v = +inp.value || 0;
        if (v) s.items[inp.dataset.item] = v; else delete s.items[inp.dataset.item];
        updateRowCost(s); updateGrand(); save();
      };
    });
    // yes/no checkboxes
    document.querySelectorAll('.si-yn').forEach(function (chk) {
      chk.onchange = function () {
        var s = D().schoolsList.find(function (x) { return x.id == chk.dataset.sid; });
        if (!s) return; if (!s.items) s.items = {};
        if (chk.checked) s.items[chk.dataset.item] = true; else delete s.items[chk.dataset.item];
        updateRowCost(s); updateGrand(); save();
      };
    });
  }

  function updateRowCost(s) {
    var cell = document.querySelector('.si-cost[data-sid="' + s.id + '"]');
    if (cell) cell.textContent = money(schoolItemCost(s));
  }
  function updateGrand() {
    var grand = document.getElementById('si-grand');
    if (grand) grand.textContent = 'Total items cost: ' + money(totalItemCost());
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.si-prices{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 14px;margin-bottom:6px}' +
      '.si-price{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--text2)}' +
      '.si-name em{font-size:10px;color:var(--text3);font-style:normal}' +
      '.si-unit{display:flex;align-items:center;gap:2px;color:var(--text3)}' +
      '.si-price-in{width:70px}' +
      '.si-table{border-collapse:collapse;font-size:11px;min-width:100%}' +
      '.si-table th,.si-table td{border:.5px solid var(--border);padding:3px 5px;text-align:center}' +
      '.si-table th{background:var(--bg3);color:var(--text2);font-weight:600;font-size:10px;white-space:nowrap}' +
      '.si-table input[type=number]{font-size:11px;padding:2px 4px}';
    document.head.appendChild(s);
  }

  function injectIntoSchoolsPage() {
    var page = document.getElementById('page-schools');
    if (!page || document.getElementById('school-items-card')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = buildSection();
    page.appendChild(wrap.firstChild);
    renderSection();

    // re-render whenever the schools page is shown or the roster changes
    if (window.showPage && !window.showPage.__itemsWrapped) {
      var orig = window.showPage;
      window.showPage = function (pg) {
        var out = orig.apply(this, arguments);
        if (pg === 'schools') setTimeout(renderSection, 30);
        return out;
      };
      window.showPage.__itemsWrapped = true;
    }
    // also refresh after CSV imports (renderSchools is called then)
    if (window.renderSchools && !window.renderSchools.__itemsWrapped) {
      var origR = window.renderSchools;
      window.renderSchools = function () {
        var out = origR.apply(this, arguments);
        setTimeout(renderSection, 30);
        return out;
      };
      window.renderSchools.__itemsWrapped = true;
    }
  }

  function boot() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      hookPersist();
      if (window.D && document.getElementById('page-schools') && !document.getElementById('school-items-card')) {
        injectStyles(); injectIntoSchoolsPage(); clearInterval(iv);
      }
      if (tries > 80) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
