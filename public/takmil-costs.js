// ════════════════════════════════════════════════════════════════
// takmil-costs.js — R1: Overheads & Fixed Costs restructure.
//
// Replaces the old generic overhead fields with named line items in
// three groups, each tagged by region (Pakistan / North America), and
// software additionally tagged by vertical (Data / LMS / — ).
//
// Tags power R3 (cost-per-child with/without NA, with/without Data&LMS).
// Default cost-per-child includes EVERYTHING (Pakistan + NA).
//
// Money stored USD; displayed via f$(). Persisted in D.costItems and
// captured by version snapshots (serializeD wrapper).
// ════════════════════════════════════════════════════════════════
(function () {
  var GROUPS = ['Overheads & Fixed Costs', 'New Projects', 'Software'];
  var REGIONS = ['Pakistan', 'North America'];
  var VERTICALS = ['\u2014', 'Data', 'LMS'];

  var DEFAULTS = [
    { name: 'Office Rent-Lahore',        group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Office Rent-Islamabad',     group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Audit & Legal Fees',        group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Petty Cash',                group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Shipment Costs',            group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Repair & Maintenance',      group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Miscellaneous/Contingency', group: 'Overheads & Fixed Costs', region: 'Pakistan',      vertical: '\u2014' },
    { name: 'AI Project',                group: 'New Projects',            region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Sustainability',            group: 'New Projects',            region: 'Pakistan',      vertical: '\u2014' },
    { name: 'Curriculum Development',    group: 'New Projects',            region: 'Pakistan',      vertical: '\u2014' },
    { name: 'PayPeople',                 group: 'Software',                region: 'Pakistan',      vertical: 'Data' },
    { name: 'Azure',                     group: 'Software',                region: 'Pakistan',      vertical: 'Data' },
    { name: 'Power BI',                  group: 'Software',                region: 'Pakistan',      vertical: 'Data' },
    { name: 'Bloomerang',               group: 'Software',                region: 'North America', vertical: 'LMS' },
    { name: 'Zoom',                      group: 'Software',                region: 'Pakistan',      vertical: '\u2014' }
  ];

  function D() { return window.D; }
  function money(usd) { return (typeof window.f$ === 'function') ? window.f$(usd) : '$' + Math.round(usd).toLocaleString(); }
  function toDisp(u) { return (typeof window.toDisplay === 'function') ? window.toDisplay(u) : u; }
  function fromDisp(v) { return (typeof window.fromDisplay === 'function') ? window.fromDisplay(v) : v; }
  function curUnit() { try { return (window.CUR && window.CUR.mode === 'pkr') ? 'Rs.' : '$'; } catch (e) { return '$'; } }

  function items() {
    var d = D();
    if (!Array.isArray(d.costItems)) {
      d.costItems = DEFAULTS.map(function (x, i) { return Object.assign({ id: 'c' + i, amount: 0 }, x); });
      try {
        if (d.overhead) {
          var legacy = Object.values(d.overhead).reduce(function (a, v) { return a + (v || 0); }, 0);
          if (legacy > 0) {
            var misc = d.costItems.filter(function (c) { return c.name === 'Miscellaneous/Contingency'; })[0];
            if (misc) misc.amount = legacy;
          }
        }
        if (d.naOverhead > 0) {
          d.costItems.push({ id: 'c_na', name: 'North America overhead', group: 'Overheads & Fixed Costs', region: 'North America', vertical: '\u2014', amount: d.naOverhead });
        }
      } catch (e) {}
    }
    return d.costItems;
  }

  function total(filterFn) {
    return items().reduce(function (a, c) {
      return a + ((!filterFn || filterFn(c)) ? (+c.amount || 0) : 0);
    }, 0);
  }
  window.takmilCostsTotal = total;
  window.takmilCostsExclNA = function () { return total(function (c) { return c.region !== 'North America'; }); };
  window.takmilCostsExclDataLMS = function () { return total(function (c) { return c.vertical !== 'Data' && c.vertical !== 'LMS'; }); };
  window.takmilCostsExclBoth = function () { return total(function (c) { return c.region !== 'North America' && c.vertical !== 'Data' && c.vertical !== 'LMS'; }); };
  window.takmilCostsNA = function () { return total(function (c) { return c.region === 'North America'; }); };
  window.takmilCostItems = items;

  function save() {
    try { if (window.SESSION && window.SESSION.role === 'viewer') return; } catch (e) {}
    if (typeof window.scheduleSave === 'function') window.scheduleSave();
    if (typeof window.saveToStorage === 'function') { try { window.saveToStorage(false); } catch (e) {} }
    ['recalc', 'updateKPIs', 'renderDashboard'].forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
  }

  function hookPersist() {
    if (window.serializeD && !window.serializeD.__costsWrapped) {
      var os = window.serializeD;
      window.serializeD = function () {
        var out = os.apply(this, arguments);
        try { out.costItems = JSON.parse(JSON.stringify(items())); } catch (e) {}
        return out;
      };
      window.serializeD.__costsWrapped = true;
    }
    if (window.restoreD && !window.restoreD.__costsWrapped) {
      var or = window.restoreD;
      window.restoreD = function (saved) {
        or.apply(this, arguments);
        try { if (saved && Array.isArray(saved.costItems)) D().costItems = saved.costItems; } catch (e) {}
      };
      window.restoreD.__costsWrapped = true;
    }
    if (!hookPersist.__reapplied) {
      try {
        var cd = window.__CLOUD_DOC;
        if (cd && Array.isArray(cd.costItems)) { D().costItems = cd.costItems; hookPersist.__reapplied = true; setTimeout(render, 80); }
      } catch (e) {}
    }
  }

  // Mirror the new cost items into the legacy D.overhead/naOverhead buckets so
  // the existing overhead() and cost-per-child pick them up.
  function syncToLegacy() {
    var d = D();
    var na = total(function (c) { return c.region === 'North America'; });
    var pk = total(function (c) { return c.region !== 'North America'; });
    d.overhead = { _r1: pk };
    d.naOverhead = na;
  }
  window.takmilSyncCosts = syncToLegacy;

  function buildUI() {
    var anchor = document.getElementById('r1-costs-anchor');
    if (!anchor) return;
    anchor.innerHTML =
      '<div class="ps-section" style="margin-top:22px;display:flex;justify-content:space-between;align-items:center">' +
      '<span>Overheads, Projects &amp; Software</span>' +
      '<span style="font-size:12px;font-weight:600;color:var(--text)">Total: <span id="r1-grand" style="color:var(--accent)"></span></span></div>' +
      '<div id="r1-groups"></div>';
    render();
  }

  function render() {
    var host = document.getElementById('r1-groups');
    if (!host) return;
    syncToLegacy();
    var html = GROUPS.map(function (g) {
      var rows = items().filter(function (c) { return c.group === g; });
      var groupTotal = rows.reduce(function (a, c) { return a + (+c.amount || 0); }, 0);
      var isSoftware = (g === 'Software');
      return '<div class="r1-group">' +
        '<div class="r1-group-head"><span>' + g + '</span><span class="r1-group-tot">' + money(groupTotal) + '</span></div>' +
        '<table class="r1-tbl"><thead><tr>' +
        '<th style="text-align:left">Item</th><th>Amount (' + curUnit() + ')</th><th>Region</th>' +
        (isSoftware ? '<th>Vertical</th>' : '') +
        '<th></th></tr></thead><tbody>' +
        rows.map(function (c) {
          return '<tr>' +
            '<td style="text-align:left"><input class="r1-name" data-id="' + c.id + '" value="' + esc(c.name) + '"></td>' +
            '<td><input type="number" min="0" step="1" class="r1-amt" data-id="' + c.id + '" value="' + Math.round(toDisp(c.amount || 0)) + '" style="width:100px"></td>' +
            '<td><select class="r1-region" data-id="' + c.id + '">' + REGIONS.map(function (r) {
              return '<option' + (c.region === r ? ' selected' : '') + '>' + r + '</option>';
            }).join('') + '</select></td>' +
            (isSoftware ? '<td><select class="r1-vertical" data-id="' + c.id + '">' + VERTICALS.map(function (v) {
              return '<option' + (c.vertical === v ? ' selected' : '') + '>' + v + '</option>';
            }).join('') + '</select></td>' : '') +
            '<td><button class="r1-del" data-id="' + c.id + '" title="Remove">\u00d7</button></td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>' +
        '<button class="r1-add" data-group="' + esc(g) + '">+ Add line</button>' +
        '</div>';
    }).join('');
    host.innerHTML = html;
    var grand = document.getElementById('r1-grand');
    if (grand) grand.textContent = money(total());
    wire();
  }

  function wire() {
    document.querySelectorAll('.r1-amt').forEach(function (inp) {
      inp.onchange = function () { var c = byId(inp.dataset.id); if (c) { c.amount = fromDisp(+inp.value || 0); render(); save(); } };
    });
    document.querySelectorAll('.r1-name').forEach(function (inp) {
      inp.onchange = function () { var c = byId(inp.dataset.id); if (c) { c.name = inp.value; save(); } };
    });
    document.querySelectorAll('.r1-region').forEach(function (sel) {
      sel.onchange = function () { var c = byId(sel.dataset.id); if (c) { c.region = sel.value; render(); save(); } };
    });
    document.querySelectorAll('.r1-vertical').forEach(function (sel) {
      sel.onchange = function () { var c = byId(sel.dataset.id); if (c) { c.vertical = sel.value; save(); } };
    });
    document.querySelectorAll('.r1-del').forEach(function (btn) {
      btn.onclick = function () {
        var arr = items(); var i = arr.findIndex(function (c) { return c.id === btn.dataset.id; });
        if (i >= 0) { arr.splice(i, 1); render(); save(); }
      };
    });
    document.querySelectorAll('.r1-add').forEach(function (btn) {
      btn.onclick = function () {
        items().push({ id: 'c' + Date.now(), name: 'New item', group: btn.dataset.group, region: 'Pakistan', vertical: '\u2014', amount: 0 });
        render(); save();
      };
    });
  }

  function byId(id) { return items().filter(function (c) { return c.id === id; })[0]; }
  function esc(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.r1-group{margin-bottom:18px}' +
      '.r1-group-head{display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:var(--accent);margin-bottom:6px;padding-bottom:4px;border-bottom:.5px solid var(--border2)}' +
      '.r1-group-tot{color:var(--text)}' +
      '.r1-tbl{width:100%;border-collapse:collapse;font-size:12px}' +
      '.r1-tbl th{font-size:10px;color:var(--text3);font-weight:600;text-align:center;padding:4px 6px}' +
      '.r1-tbl td{padding:3px 6px;text-align:center}' +
      '.r1-tbl input,.r1-tbl select{background:var(--bg3);border:.5px solid var(--border2);border-radius:5px;padding:4px 6px;color:var(--text);font-size:12px}' +
      '.r1-name{width:100%}' +
      '.r1-del{background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;line-height:1}' +
      '.r1-del:hover{color:var(--red,#ef4444)}' +
      '.r1-add{background:none;border:.5px dashed var(--border2);color:var(--accent);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-top:6px}';
    document.head.appendChild(s);
  }

  function hideOldOverhead() {
    var grid = document.querySelector('.ps-overhead-grid');
    if (grid) grid.style.display = 'none';
    if (grid && grid.previousElementSibling) {
      var hdr = grid.previousElementSibling;
      if (hdr && hdr.querySelector && hdr.querySelector('#d-overhead')) hdr.style.display = 'none';
    }
  }

  function boot() {
    var t = 0;
    var iv = setInterval(function () {
      t++; hookPersist();
      var cloudSettled = hookPersist.__reapplied || !!window.__CLOUD_DOC || t > 12;
      if (window.D && document.getElementById('r1-costs-anchor') && !document.getElementById('r1-groups') && cloudSettled) {
        injectStyles(); hideOldOverhead(); buildUI(); syncToLegacy();
        if (window.setCurrency && !window.setCurrency.__costsWrapped) {
          var oc = window.setCurrency;
          window.setCurrency = function () { var r = oc.apply(this, arguments); setTimeout(render, 25); return r; };
          window.setCurrency.__costsWrapped = true;
        }
        if (window.showPage && !window.showPage.__costsWrapped) {
          var op = window.showPage;
          window.showPage = function (pg) { var r = op.apply(this, arguments); if (pg === 'settings') setTimeout(render, 30); return r; };
          window.showPage.__costsWrapped = true;
        }
        try { if (typeof window.recalc === 'function') window.recalc(); } catch (e) {}
        clearInterval(iv);
      }
      if (t > 80) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
