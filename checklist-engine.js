/*
 * checklist-engine.js — the whole generator: validates a checklist source and
 * renders it to one self-contained bilingual (English / Arabic) HTML page.
 *
 * No dependencies. The same file is used by:
 *   - generator.html (browser):  <script src="checklist-engine.js"></script> → window.ChecklistEngine
 *   - bin/checklists.js (Node):  require('./checklist-engine.js')
 *
 * API
 *   build(source, name, config)    → { html, page, problems }   html is null when problems is not empty
 *   normalise(source, name, config) → { page, problems }
 *   render(page)                   → html string
 *   importPage(html, parse)        → source object, from an existing checklist page
 *                                     (parse: html string → Document, e.g. DOMParser in a browser)
 *   places(config)                 → the step labels in use: { key: [English, Arabic] }
 *   DEFAULTS                       → the built-in places, how-to lines and fail note
 *
 * Formats: checklist.schema.json (a source) and checklists.config.schema.json (a project).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChecklistEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STYLE = "\n:root {\n  --bg: #f6f5f3; --surface: #ffffff; --ink: #1c1917; --muted: #6b6560; --line: #e7e3df;\n  --accent: #0f766e; --accent-soft: #ccfbf1; --done: #a8a29e; --code-bg: #f1efec; --warn: #b45309; --warn-soft: #fef3c7;\n  color-scheme: light;\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=\"light\"]) {\n    --bg: #12100f; --surface: #1c1917; --ink: #f5f5f4; --muted: #a8a29e; --line: #2e2a27;\n    --accent: #2dd4bf; --accent-soft: #134e4a; --done: #78716c; --code-bg: #262220; --warn: #f59e0b; --warn-soft: #3a2a0c;\n    color-scheme: dark;\n  }\n}\n:root[data-theme=\"dark\"] {\n  --bg: #12100f; --surface: #1c1917; --ink: #f5f5f4; --muted: #a8a29e; --line: #2e2a27;\n  --accent: #2dd4bf; --accent-soft: #134e4a; --done: #78716c; --code-bg: #262220; --warn: #f59e0b; --warn-soft: #3a2a0c;\n  color-scheme: dark;\n}\n* { box-sizing: border-box; }\nbody { margin: 0; background: var(--bg); color: var(--ink);\n  font: 15px/1.55 system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif; }\nhtml[data-lang=\"ar\"] body { font-family: system-ui, -apple-system, \"Segoe UI\", Tahoma, \"Noto Sans Arabic\", sans-serif; line-height: 1.7; }\nhtml:not([data-lang=\"ar\"]) .ar { display: none !important; }\nhtml[data-lang=\"ar\"] .en { display: none !important; }\n.wrap { max-width: 920px; margin: 0 auto; padding: 0 16px 80px; }\n.top { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 92%, transparent);\n  backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }\n.top-inner { max-width: 920px; margin: 0 auto; padding: 12px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }\n.top h1 { font-size: 17px; margin: 0; flex: 1 1 220px; }\n.overall { display: flex; align-items: center; gap: 10px; flex: 1 1 240px; }\n.overall .meter { flex: 1; }\n.overall strong { font-variant-numeric: tabular-nums; white-space: nowrap; direction: ltr; unicode-bidi: isolate; }\n.actions { display: flex; gap: 8px; flex-wrap: wrap; }\nbutton, .toggle { font: inherit; font-size: 13px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);\n  border-radius: 8px; padding: 6px 10px; cursor: pointer; }\nbutton:hover, .toggle:hover { border-color: var(--accent); }\n.toggle { display: inline-flex; gap: 6px; align-items: center; }\n.meter { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; min-width: 80px; }\n.meter span { display: block; height: 100%; width: 0; background: var(--accent); transition: width .25s; }\n.intro { margin: 20px 0; }\n.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin: 16px 0; scroll-margin-top: 80px; }\n.section-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }\n.section-head h2 { font-size: 18px; margin: 0; flex: 1 1 260px; }\n.section-head .meter { flex: 0 1 140px; }\n.count, .toc-count { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }\nh3 { font-size: 15px; margin: 16px 0 6px; }\np { margin: 8px 0; }\nul, ol { margin: 6px 0; padding-inline-start: 22px; }\nli { margin: 3px 0; }\ncode { font-family: ui-monospace, \"Cascadia Code\", Consolas, monospace; font-size: .88em; background: var(--code-bg);\n  padding: 1px 5px; border-radius: 5px; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }\n.code { position: relative; margin: 8px 0 12px; }\n.code pre { background: var(--code-bg); border-radius: 10px; padding: 12px 14px; padding-inline-end: 70px; margin: 0; overflow-x: auto; direction: ltr; text-align: left; }\n.code pre code { background: none; padding: 0; white-space: pre; overflow-wrap: normal; }\n.copy { position: absolute; top: 6px; inset-inline-end: 6px; padding: 3px 8px; font-size: 12px; }\n.note { background: var(--warn-soft); border-radius: 10px; padding: 10px 14px; margin: 12px 0 4px; }\n.note strong:first-child { color: var(--warn); }\n.items { display: grid; gap: 10px; margin: 10px 0 0; }\n.item { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }\n.item .head { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-weight: 600; }\n.item .head input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--accent); flex: none; cursor: pointer; }\nhtml[data-lang=\"ar\"] .item .head input { margin-top: 6px; }\n.item .num { color: var(--muted); font-variant-numeric: tabular-nums; }\n.item .body { margin-inline-start: 28px; overflow-wrap: anywhere; }\n.item .label { display: block; margin: 10px 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }\n.item .label.expect { color: var(--accent); }\n.item .label.steps::before { content: \"Steps\"; }\n.item .label.expect::before { content: \"You should see\"; }\nhtml[data-lang=\"ar\"] .item .label { letter-spacing: 0; font-size: 13px; }\nhtml[data-lang=\"ar\"] .item .label.steps::before { content: \"الخطوات\"; }\nhtml[data-lang=\"ar\"] .item .label.expect::before { content: \"النتيجة المتوقعة\"; }\n.item.done { background: var(--code-bg); }\n.item.done .head .title { color: var(--done); text-decoration: line-through; }\n.item.done .body { opacity: .55; }\nbody.hide-done .item.done { display: none; }\n.where { display: inline-block; font-size: 12px; font-weight: 600; padding: 0 7px; border-radius: 99px; background: var(--accent-soft); color: var(--ink); margin-inline-end: 4px; white-space: nowrap; }\n.toc { columns: 2 260px; padding-inline-start: 18px; margin: 8px 0 0; }\n.toc a { color: var(--accent); text-decoration: none; }\n.toc a:hover { text-decoration: underline; }\n.saved { color: var(--muted); font-size: 12px; }\n.complete { color: var(--accent); font-weight: 600; }\n@media (max-width: 560px) { .card { padding: 14px; } .top h1 { font-size: 15px; } .item .body { margin-inline-start: 0; } }\n";
  var HEAD_SCRIPT = "(function () {\n  var KEY = __KEY__, lang = null;\n  try { var q = new URLSearchParams(location.search).get('lang'); if (q === 'ar' || q === 'en') { lang = q; } } catch (e) {}\n  if (!lang) { try { lang = localStorage.getItem(KEY + ':lang'); } catch (e) {} }\n  if (lang === 'ar') { var r = document.documentElement; r.lang = 'ar'; r.dir = 'rtl'; r.dataset.lang = 'ar'; }\n})();\n";
  var TAIL_SCRIPT = "(function () {\n  var KEY = __KEY__;\n  var state = {};\n  try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; }\n  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }\n\n  var root = document.documentElement;\n  var T = {\n    en: { title: __TITLE_EN__, copy: 'Copy', copied: 'Copied', reset: 'Clear every tick on this checklist?' },\n    ar: { title: __TITLE_AR__, copy: 'نسخ', copied: 'تم النسخ', reset: 'هل تريد مسح كل العلامات في هذه القائمة؟' }\n  };\n  function lang() { return root.dataset.lang === 'ar' ? 'ar' : 'en'; }\n  function applyLang(l) {\n    if (l === 'ar') { root.dataset.lang = 'ar'; } else { delete root.dataset.lang; }\n    root.lang = l; root.dir = l === 'ar' ? 'rtl' : 'ltr';\n    document.title = T[l].title;\n    document.querySelectorAll('.copy').forEach(function (b) { b.textContent = T[l].copy; });\n  }\n  applyLang(lang());\n  document.getElementById('lang').addEventListener('click', function () {\n    var next = lang() === 'ar' ? 'en' : 'ar';\n    applyLang(next);\n    try { localStorage.setItem(KEY + ':lang', next); } catch (e) {}\n  });\n\n  var items = Array.prototype.slice.call(document.querySelectorAll('.item'));\n  items.forEach(function (item) {\n    var box = item.querySelector('input');\n    box.checked = !!state[item.dataset.key];\n    item.classList.toggle('done', box.checked);\n    box.addEventListener('change', function () {\n      if (box.checked) { state[item.dataset.key] = Date.now(); } else { delete state[item.dataset.key]; }\n      item.classList.toggle('done', box.checked);\n      save(); refresh();\n    });\n  });\n\n  function refresh() {\n    var all = items.length, done = items.filter(function (i) { return i.classList.contains('done'); }).length;\n    document.getElementById('overall-bar').style.width = (all ? done / all * 100 : 0) + '%';\n    document.getElementById('overall-count').textContent = done + ' / ' + all;\n    document.querySelectorAll('[data-section]').forEach(function (section) {\n      var mine = section.querySelectorAll('.item'), d = section.querySelectorAll('.item.done').length;\n      section.querySelector('.section-head .meter span').style.width = (mine.length ? d / mine.length * 100 : 0) + '%';\n      document.querySelectorAll('[data-count-for=\"' + section.id + '\"]').forEach(function (el) {\n        el.textContent = mine.length ? d + ' / ' + mine.length : '';\n        el.classList.toggle('complete', mine.length > 0 && d === mine.length);\n      });\n    });\n  }\n\n  var hide = document.getElementById('hide-done');\n  try { hide.checked = localStorage.getItem(KEY + ':hide') === '1'; } catch (e) {}\n  document.body.classList.toggle('hide-done', hide.checked);\n  hide.addEventListener('change', function () {\n    document.body.classList.toggle('hide-done', hide.checked);\n    try { localStorage.setItem(KEY + ':hide', hide.checked ? '1' : '0'); } catch (e) {}\n  });\n\n  try { var t = localStorage.getItem(KEY + ':theme'); if (t) { root.dataset.theme = t; } } catch (e) {}\n  document.getElementById('theme').addEventListener('click', function () {\n    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;\n    root.dataset.theme = dark ? 'light' : 'dark';\n    try { localStorage.setItem(KEY + ':theme', root.dataset.theme); } catch (e) {}\n  });\n\n  document.getElementById('reset').addEventListener('click', function () {\n    if (!confirm(T[lang()].reset)) { return; }\n    state = {}; save();\n    items.forEach(function (i) { i.querySelector('input').checked = false; i.classList.remove('done'); });\n    refresh();\n  });\n\n  document.querySelectorAll('.copy').forEach(function (btn) {\n    btn.addEventListener('click', function () {\n      var text = btn.parentNode.querySelector('code').textContent;\n      var done = function () { btn.textContent = T[lang()].copied; setTimeout(function () { btn.textContent = T[lang()].copy; }, 1200); };\n      if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done, function () {}); }\n    });\n  });\n\n  refresh();\n})();\n";

  var DEFAULTS = {
    /** Where a step happens: the coloured label in front of it. [English, Arabic] */
    places: {
      server: ['Server', 'الخادم'],
      database: ['Database', 'قاعدة البيانات'],
      admin: ['Admin panel', 'لوحة الإدارة'],
      website: ['Website', 'الموقع'],
      mobile_app: ['Mobile app', 'تطبيق الجوال'],
      api: ['API client', 'عميل API'],
      mailbox: ['Mailbox', 'البريد'],
      partner: ['Partner system', 'نظام الشريك']
    },
    how_to: {
      en: [
        'Do section 0 first. After that, sections can be run in any order and by different people.',
        'For each check, do the <strong>Steps</strong>, then compare what you see with <strong>You should see</strong>.',
        'Tick the box only when <strong>every</strong> line under "You should see" is true.'
      ],
      ar: [
        'نفّذ القسم 0 أولًا. بعده يمكن تنفيذ الأقسام بأي ترتيب ومن أشخاص مختلفين.',
        'في كل فحص نفّذ <strong>الخطوات</strong> ثم قارن ما تراه بـ<strong>النتيجة المتوقعة</strong>.',
        'ضع العلامة فقط عندما يتحقق <strong>كل</strong> سطر في «النتيجة المتوقعة».'
      ]
    },
    fail_note: {
      en: '<strong>When a check fails:</strong> don\'t tick it. Note the time, the page URL, the record you were working on (an order number, an id), the language you were in, and take a screenshot. Send it with the check number (e.g. 2.3). Then go on with the next check.',
      ar: '<strong>عند فشل فحص:</strong> لا تضع العلامة. سجّل الوقت ورابط الصفحة والسجل الذي كنت تعمل عليه (رقم طلب أو معرّف) واللغة المستخدمة، والتقط لقطة شاشة. أرسلها مع رقم الفحص (مثل 2.3)، ثم انتقل إلى الفحص التالي.'
    },
    storage_prefix: 'checklist-'
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slug(s, sep) {
    sep = sep || '-';
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp('^' + sep + '+|' + sep + '+$', 'g'), '');
  }

  function isText(v) {
    return typeof v === 'string' && v.trim() !== '';
  }

  function isPair(v) {
    return v && typeof v === 'object' && isText(v.en) && isText(v.ar);
  }

  function isLines(v) {
    return v && typeof v === 'object' && Array.isArray(v.en) && Array.isArray(v.ar);
  }

  /** Built-in places, then the project's, then the source's. Later ones win. */
  function places(config, spec) {
    var out = {};
    [DEFAULTS.places, (config && config.places) || {}, (spec && spec.places) || {}].forEach(function (set) {
      Object.keys(set).forEach(function (k) {
        var v = set[k];
        if (Array.isArray(v) && isText(v[0]) && isText(v[1])) { out[k] = [v[0], v[1]]; }
      });
    });
    return out;
  }

  /**
   * Checks a source and fills in what is derived: numbers, ids, the legend,
   * the defaults. Returns { page, problems }; page is null on any problem.
   */
  function normalise(spec, name, config) {
    config = config || {};
    var problems = [];

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      return { page: null, problems: ['The source must be a JSON object.'] };
    }

    ['places'].forEach(function (field) {
      var set = spec[field] || {};
      Object.keys(set).forEach(function (k) {
        var v = set[k];
        if (!Array.isArray(v) || !isText(v[0]) || !isText(v[1])) {
          problems.push(field + '.' + k + ': give ["English label", "Arabic label"].');
        }
      });
    });

    var known = places(config, spec);

    function pair(v, where) {
      v = v && typeof v === 'object' ? v : {};
      ['en', 'ar'].forEach(function (lang) {
        if (!isText(v[lang])) { problems.push(where + ': missing "' + lang + '".'); }
      });
      return { en: String(v.en || ''), ar: String(v.ar || '') };
    }

    var prefix = isText(config.storage_prefix) ? config.storage_prefix : DEFAULTS.storage_prefix;

    var page = {
      storage_key: isText(spec.storage_key) ? spec.storage_key : prefix + slug(name || 'checklist') + '-v1',
      title: pair(spec.title, 'title'),
      heading: pair(spec.heading, 'heading'),
      intro: pair(spec.intro, 'intro'),
      fail_note: spec.fail_note ? pair(spec.fail_note, 'fail_note') : (isPair(config.fail_note) ? config.fail_note : DEFAULTS.fail_note),
      sections: []
    };

    var keys = {};
    var used = {};
    var sections = Array.isArray(spec.sections) ? spec.sections : [];

    if (sections.length === 0) { problems.push('sections: there are none.'); }

    sections.forEach(function (section, s) {
      section = section || {};
      var title = pair(section.title, 'section ' + s + ' title');
      var items = Array.isArray(section.items) ? section.items : [];

      if (items.length === 0) { problems.push('section ' + s + ': no checks.'); }

      page.sections.push({
        id: isText(section.id) ? section.id : 's' + s + '-' + (slug(title.en) || 'section'),
        title: { en: s + '. ' + title.en, ar: s + '. ' + title.ar },
        items: items.map(function (item, i) {
          item = item || {};
          var number = s + '.' + (i + 1);
          var label = 'check ' + number;

          if (!isText(item.key)) {
            problems.push(label + ': missing "key".');
          } else if (keys[item.key]) {
            problems.push(label + ': key "' + item.key + '" is already used by check ' + keys[item.key] + '.');
          } else {
            keys[item.key] = number;
          }

          var steps = (Array.isArray(item.steps) ? item.steps : []).map(function (step, n) {
            step = step || {};
            var where = label + ' step ' + (n + 1);
            if (!known[step.where]) {
              problems.push(where + ': unknown place "' + step.where + '" (known: ' + Object.keys(known).join(', ') + '; add yours under "places").');
            } else {
              used[step.where] = true;
            }
            var text = pair(step, where);
            return { place: known[step.where] || [String(step.where), String(step.where)], en: text.en, ar: text.ar };
          });

          var expect = (Array.isArray(item.expect) ? item.expect : []).map(function (line, n) {
            return pair(line, label + ' expectation ' + (n + 1));
          });

          if (steps.length === 0) { problems.push(label + ': no steps.'); }
          if (expect.length === 0) { problems.push(label + ': nothing under "expect".'); }

          var code = Array.isArray(item.code) ? item.code : (isText(item.code) ? [item.code] : []);

          return {
            key: String(item.key || ''),
            number: number,
            title: pair(item.title, label + ' title'),
            steps: steps,
            code: code.map(String),
            expect: expect
          };
        })
      });
    });

    var base = isLines(spec.how_to) ? spec.how_to : (isLines(config.how_to) ? config.how_to : DEFAULTS.how_to);
    var howTo = { en: base.en.slice(), ar: base.ar.slice() };

    // The legend lists the places this checklist uses, in catalogue order.
    var legend = Object.keys(known).filter(function (k) { return used[k]; });
    if (legend.length) {
      var tags = function (i) { return legend.map(function (k) { return '<span class="where">' + esc(known[k][i]) + '</span>'; }).join(' '); };
      howTo.en.push('The coloured label at the start of a step says where it happens: ' + tags(0) + '.');
      howTo.ar.push('الوسم الملوّن في بداية كل خطوة يبيّن أين تتم: ' + tags(1) + '.');
    }
    page.how_to = howTo;

    return { page: problems.length ? null : page, problems: problems };
  }

  /** A normalised page as the complete HTML document. Texts are trusted HTML; code is escaped. */
  function render(page) {
    var o = [];
    var p = function (s) { o.push(s); };
    var both = function (v) { return '<span class="en">' + v.en + '</span><span class="ar">' + v.ar + '</span>'; };

    p('<!doctype html>\n<html lang="en" dir="ltr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">');
    p('<meta name="generator" content="checklist-generator">');
    p('<title>' + esc(page.title.en) + '</title>');
    p('<script>\n' + HEAD_SCRIPT.replace('__KEY__', JSON.stringify(page.storage_key)) + '</' + 'script>');
    p('<style>' + STYLE + '</style>\n</head>\n<body>');
    p('<div class="top"><div class="top-inner">');
    p('  <h1>' + both(page.heading) + '</h1>');
    p('  <div class="overall"><div class="meter" aria-hidden="true"><span id="overall-bar"></span></div><strong id="overall-count"></strong></div>');
    p('  <div class="actions">');
    p('    <button type="button" id="lang"><span class="en" lang="ar">العربية</span><span class="ar" lang="en">English</span></button>');
    p('    <label class="toggle"><input type="checkbox" id="hide-done"> <span class="en">Hide done</span><span class="ar">إخفاء المنجز</span></label>');
    p('    <button type="button" id="theme"><span class="en">Theme</span><span class="ar">المظهر</span></button>');
    p('    <button type="button" id="reset"><span class="en">Reset</span><span class="ar">إعادة الضبط</span></button>');
    p('  </div>\n</div></div>\n<main class="wrap">\n  <div class="intro card">');

    [['en', 'How to use this page'], ['ar', 'طريقة استخدام هذه الصفحة']].forEach(function (l) {
      p('    <div class="' + l[0] + '">\n      ' + page.intro[l[0]] + '\n      <h3>' + l[1] + '</h3>\n      <ol>');
      page.how_to[l[0]].forEach(function (line) { p('        <li>' + line + '</li>'); });
      p('      </ol>\n    </div>');
    });

    p('    <div class="note en">' + page.fail_note.en + '</div>');
    p('    <div class="note ar">' + page.fail_note.ar + '</div>');
    p('    <p class="saved"><span class="en">Your ticks are saved in this browser only (local storage) and are shared between the English and Arabic views. Reset clears them.</span><span class="ar">تُحفظ علاماتك في هذا المتصفح فقط (التخزين المحلي) وهي مشتركة بين العرضين العربي والإنجليزي. «إعادة الضبط» تمسحها.</span></p>');
    p('    <ol class="toc">');
    page.sections.forEach(function (s) {
      p('      <li><a href="#' + esc(s.id) + '">' + both(s.title) + '</a> <span class="toc-count" data-count-for="' + esc(s.id) + '"></span></li>');
    });
    p('    </ol>\n  </div>\n');

    page.sections.forEach(function (s) {
      p('  <section class="card" id="' + esc(s.id) + '" data-section><header class="section-head"><h2>' + both(s.title) + '</h2><div class="meter" aria-hidden="true"><span></span></div><span class="count" data-count-for="' + esc(s.id) + '"></span></header><div class="items">\n');
      s.items.forEach(function (it) {
        p('    <div class="item" data-key="' + esc(it.key) + '">');
        p('      <label class="head"><input type="checkbox"><span class="title"><span class="num">' + it.number + '</span> ' + both(it.title) + '</span></label>');
        p('      <div class="body">\n        <span class="label steps"></span>');
        [['en', 0], ['ar', 1]].forEach(function (l) {
          p('        <ol class="' + l[0] + '">');
          it.steps.forEach(function (st) { p('          <li><span class="where">' + esc(st.place[l[1]]) + '</span> ' + st[l[0]] + '</li>'); });
          p('        </ol>');
        });
        it.code.forEach(function (c) {
          p('        <div class="code"><button type="button" class="copy">Copy</button><pre><code>' + esc(c) + '</code></pre></div>');
        });
        p('        <span class="label expect"></span>');
        ['en', 'ar'].forEach(function (lang) {
          p('        <ul class="' + lang + '">');
          it.expect.forEach(function (e) { p('          <li>' + e[lang] + '</li>'); });
          p('        </ul>');
        });
        p('      </div>\n    </div>\n');
      });
      p('  </div></section>\n');
    });

    p('</main>');
    p('<script>\n' + TAIL_SCRIPT
      .replace('__KEY__', JSON.stringify(page.storage_key))
      .replace('__TITLE_EN__', JSON.stringify(page.title.en))
      .replace('__TITLE_AR__', JSON.stringify(page.title.ar)) + '</' + 'script>');
    p('</body>\n</html>\n');

    return o.join('\n');
  }

  /** Validates and renders in one call. */
  function build(spec, name, config) {
    var result = normalise(spec, name, config);
    return { html: result.page ? render(result.page) : null, problems: result.problems, page: result.page };
  }

  /**
   * An existing checklist page read back into a source: pages built by this
   * tool, and hand-written ones of the same structure. A step label that is
   * not a known place becomes a new entry under "places".
   *
   * parse: html string → Document (DOMParser in a browser).
   */
  function importPage(html, parse, config) {
    var doc = parse(html);
    var known = places(config);
    var byLabel = {};
    Object.keys(known).forEach(function (k) { byLabel[known[k][0]] = k; });
    var added = {};

    var both = function (el) {
      return {
        en: el ? ((el.querySelector(':scope > .en') || {}).innerHTML || '') : '',
        ar: el ? ((el.querySelector(':scope > .ar') || {}).innerHTML || '') : ''
      };
    };
    var trim = function (s) { return String(s).replace(/\s+\n/g, '\n').trim(); };
    var unnumber = function (s) { return trim(s).replace(/^\d+\.\s*/, ''); };
    var all = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };

    var spec = { $schema: 'https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/checklist.schema.json' };

    var titleEn = (html.match(/en: \{ title: (['"])(.*?)\1/) || [])[2];
    var titleAr = (html.match(/ar: \{ title: (['"])(.*?)\1/) || [])[2];
    spec.title = { en: titleEn || doc.title, ar: titleAr || doc.title };

    var h1 = both(doc.querySelector('.top h1'));
    spec.heading = { en: trim(h1.en), ar: trim(h1.ar) };

    var intro = { en: '', ar: '' }, howTo = { en: [], ar: [] };
    ['en', 'ar'].forEach(function (lang) {
      var box = doc.querySelector('.intro > div.' + lang);
      if (!box) { return; }
      var parts = [];
      for (var n = box.firstElementChild; n && n.tagName !== 'H3'; n = n.nextElementSibling) { parts.push(n.outerHTML); }
      intro[lang] = parts.join('');
      var ol = box.querySelector('h3 + ol');
      if (ol) {
        // The legend line is rebuilt on every build; the rest is kept.
        howTo[lang] = Array.prototype.map.call(ol.children, function (li) { return trim(li.innerHTML); })
          .filter(function (line) { return line.indexOf('class="where"') === -1; });
      }
    });
    spec.intro = intro;
    spec.how_to = howTo;

    var noteEn = doc.querySelector('.intro .note.en'), noteAr = doc.querySelector('.intro .note.ar');
    if (noteEn && noteAr) { spec.fail_note = { en: trim(noteEn.innerHTML), ar: trim(noteAr.innerHTML) }; }

    var key = html.match(/var KEY = ['"]([^'"]+)['"]/);
    if (key) { spec.storage_key = key[1]; }

    spec.sections = all(doc, 'section[data-section]').map(function (section) {
      var h2 = both(section.querySelector('.section-head h2'));
      return {
        id: section.id,
        title: { en: unnumber(h2.en), ar: unnumber(h2.ar) },
        items: all(section, '.item').map(function (item) {
          var title = both(item.querySelector('.head .title'));
          var stepsAr = all(item, '.body > ol.ar > li');
          var steps = all(item, '.body > ol.en > li').map(function (li, i) {
            var arLi = stepsAr[i];
            var tagEn = li.querySelector('.where');
            var tagAr = arLi ? arLi.querySelector('.where') : null;
            var label = tagEn ? tagEn.textContent.trim() : '';
            var where = byLabel[label];
            if (!where && label) {
              where = slug(label, '_') || 'place';
              added[where] = [label, tagAr ? tagAr.textContent.trim() : label];
              byLabel[label] = where;
            }
            if (tagEn) { tagEn.remove(); }
            if (tagAr) { tagAr.remove(); }
            return { where: where || 'server', en: trim(li.innerHTML), ar: arLi ? trim(arLi.innerHTML) : '' };
          });
          var expAr = all(item, '.body > ul.ar > li');
          var check = { key: item.getAttribute('data-key'), title: { en: unnumber(title.en), ar: unnumber(title.ar) }, steps: steps };
          var code = all(item, '.code pre code').map(function (c) { return c.textContent; });
          if (code.length) { check.code = code; }
          check.expect = all(item, '.body > ul.en > li').map(function (li, i) {
            return { en: trim(li.innerHTML), ar: expAr[i] ? trim(expAr[i].innerHTML) : '' };
          });
          return check;
        })
      };
    });

    if (Object.keys(added).length) { spec.places = added; }
    return spec;
  }

  return {
    build: build,
    normalise: normalise,
    render: render,
    importPage: importPage,
    places: places,
    DEFAULTS: DEFAULTS
  };
});
