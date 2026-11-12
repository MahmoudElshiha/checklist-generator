/*
 * checklist-engine.js — the whole generator: validates a checklist source and
 * renders it to one self-contained bilingual (English / Arabic) HTML page.
 *
 * No dependencies. The same file is used by:
 *   - generator.html (browser):  <script src="checklist-engine.js"></script> → window.ChecklistEngine
 *   - bin/checklists.js (Node):  require('./checklist-engine.js')
 *
 * API
 *   build(source, name, config)     → { html, page, problems }   html is null when problems is not empty
 *   normalise(source, name, config) → { page, problems }
 *   render(page)                    → html string
 *   importPage(html, parse, config) → source object, from an existing checklist page (this
 *                                      version's or the first one's); parse: html → Document
 *   places(config)                  → the step labels in use: { key: [English, Arabic] }
 *   DEFAULTS                        → the built-in places, how-to lines and fail note
 *
 * The page (page format 2): every check takes a result — Pass, Fail, Blocked or
 * Not applicable — and a note; a run records who tested and where; "Copy
 * report" turns the run into a Markdown summary. Results are kept in the
 * tester's browser under the page's storage key. Ticks saved by a page of the
 * first format, under the same key, are read as Pass.
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
        'For each check, do the <strong>Steps</strong> and compare what you see with <strong>You should see</strong>. Choose <strong>Pass</strong> only when every line is true.',
        'Choose <strong>Fail</strong> when something differs, <strong>Blocked</strong> when you could not run it, <strong>Not applicable</strong> when it does not apply here — and say what you saw in the note.',
        'When you finish, fill in who tested and where, press <strong>Copy report</strong> and send it.'
      ],
      ar: [
        'نفّذ القسم 0 أولًا. بعده يمكن تنفيذ الأقسام بأي ترتيب ومن أشخاص مختلفين.',
        'في كل فحص نفّذ <strong>الخطوات</strong> وقارن ما تراه بـ<strong>النتيجة المتوقعة</strong>. اختر <strong>نجح</strong> فقط عندما يتحقق كل سطر.',
        'اختر <strong>فشل</strong> عند أي اختلاف، و<strong>متوقف</strong> عندما تعذّر التنفيذ، و<strong>لا ينطبق</strong> عندما لا يخص هذه البيئة — واكتب ما رأيته في الملاحظة.',
        'عند الانتهاء املأ اسم المختبِر والبيئة، واضغط <strong>نسخ التقرير</strong> وأرسله.'
      ]
    },
    fail_note: {
      en: '<strong>When a check fails:</strong> choose Fail and write in its note what you saw — the record you were working on (an order number, an id), the message, the language you were in, and the name of your screenshot. It goes into the report. Then go on with the next check.',
      ar: '<strong>عند فشل فحص:</strong> اختر «فشل» واكتب في ملاحظته ما رأيته — السجل الذي كنت تعمل عليه (رقم طلب أو معرّف) والرسالة واللغة المستخدمة واسم لقطة الشاشة. تدخل الملاحظة في التقرير. ثم انتقل إلى الفحص التالي.'
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

    Object.keys(spec.places || {}).forEach(function (k) {
      var v = spec.places[k];
      if (!Array.isArray(v) || !isText(v[0]) || !isText(v[1])) {
        problems.push('places.' + k + ': give ["English label", "Arabic label"].');
      }
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
        number: String(s),
        name: title,
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

  /* ───────────────────────────── The page ───────────────────────────── */

  var STYLE = [
    ':root {',
    '  --bg: #f6f7f7; --surface: #ffffff; --surface-2: #f1f4f4; --ink: #0f1f1e; --muted: #4b5a59; --line: #dde3e2;',
    '  --primary: #0f766e; --primary-ink: #ffffff; --primary-soft: #d5f2ee; --ring: #0f766e;',
    '  --pass: #15803d; --pass-soft: #dcf5e4; --fail: #b91c1c; --fail-soft: #fde4e4;',
    '  --blocked: #a16207; --blocked-soft: #fdf1d0; --na: #52525b; --na-soft: #ececef; --todo: #cdd5d4;',
    '  --warn: #a16207; --warn-soft: #fdf1d0; --code: #eef2f2; --shadow: 0 1px 2px rgb(15 31 30 / .06), 0 1px 1px rgb(15 31 30 / .04);',
    '  --radius: 12px; --top: 64px; color-scheme: light;',
    '}',
    '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {',
    '  --bg: #0d1211; --surface: #151c1b; --surface-2: #1b2423; --ink: #e8efee; --muted: #a3b1af; --line: #283433;',
    '  --primary: #2dd4bf; --primary-ink: #04201d; --primary-soft: #113a35; --ring: #5eead4;',
    '  --pass: #4ade80; --pass-soft: #11331f; --fail: #f87171; --fail-soft: #3a1515;',
    '  --blocked: #fbbf24; --blocked-soft: #3a2a08; --na: #a1a1aa; --na-soft: #26262b; --todo: #33403f;',
    '  --warn: #fbbf24; --warn-soft: #3a2a08; --code: #1b2423; --shadow: none; color-scheme: dark;',
    '} }',
    ':root[data-theme="dark"] {',
    '  --bg: #0d1211; --surface: #151c1b; --surface-2: #1b2423; --ink: #e8efee; --muted: #a3b1af; --line: #283433;',
    '  --primary: #2dd4bf; --primary-ink: #04201d; --primary-soft: #113a35; --ring: #5eead4;',
    '  --pass: #4ade80; --pass-soft: #11331f; --fail: #f87171; --fail-soft: #3a1515;',
    '  --blocked: #fbbf24; --blocked-soft: #3a2a08; --na: #a1a1aa; --na-soft: #26262b; --todo: #33403f;',
    '  --warn: #fbbf24; --warn-soft: #3a2a08; --code: #1b2423; --shadow: none; color-scheme: dark;',
    '}',
    '* { box-sizing: border-box; }',
    '[hidden] { display: none !important; }',
    'html { scroll-padding-top: calc(var(--top) + 16px); }',
    'body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-text-size-adjust: 100%; }',
    'html[data-lang="ar"] body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Sans Arabic", "Geeza Pro", sans-serif; line-height: 1.75; }',
    'html:not([data-lang="ar"]) .ar { display: none !important; }',
    'html[data-lang="ar"] .en { display: none !important; }',
    'button, input, textarea { font: inherit; color: inherit; }',
    ':focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; border-radius: 6px; }',
    '@media (prefers-reduced-motion: no-preference) { .check, .btn, .chip, .seg span { transition: background-color .15s ease, border-color .15s ease, color .15s ease; } }',
    '.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }',
    '.skip { position: absolute; inset-inline-start: 12px; top: -48px; background: var(--primary); color: var(--primary-ink); padding: 8px 12px; border-radius: 8px; z-index: 50; }',
    '.skip:focus { top: 12px; }',
    'svg.i { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    'bdi { unicode-bidi: isolate; }',
    '.top { position: sticky; top: 0; z-index: 20; height: var(--top); background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }',
    '.top-in { max-width: 1240px; height: 100%; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; gap: 12px; }',
    '.top-title { font-weight: 700; min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.top-progress { display: flex; align-items: center; gap: 10px; flex: 0 1 280px; min-width: 120px; }',
    '.count { font-variant-numeric: tabular-nums; font-size: 14px; color: var(--muted); white-space: nowrap; }',
    '.btn { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-size: 14px; font-weight: 600; white-space: nowrap; }',
    '.btn:hover { border-color: var(--primary); }',
    '.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-ink); }',
    '.btn.icon { padding: 0; width: 40px; justify-content: center; }',
    '@media (max-width: 720px) { .top-progress { display: none; } .btn .lbl-sm { display: none; } }',
    '.bar { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: var(--todo); flex: 1; min-width: 60px; }',
    '.bar span { height: 100%; }',
    '.bar .s-pass { background: var(--pass); } .bar .s-fail { background: var(--fail); } .bar .s-blocked { background: var(--blocked); } .bar .s-na { background: var(--na); }',
    '.wrap { max-width: 1240px; margin: 0 auto; padding: 20px 16px 96px; display: grid; gap: 24px; grid-template-columns: 260px minmax(0, 1fr); }',
    '@media (max-width: 960px) { .wrap { grid-template-columns: minmax(0, 1fr); } .rail { display: none; } }',
    'main { min-width: 0; }',
    '.rail { position: sticky; top: calc(var(--top) + 20px); align-self: start; max-height: calc(100dvh - var(--top) - 40px); overflow: auto; }',
    '.rail h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 8px; }',
    'html[data-lang="ar"] .rail h2, html[data-lang="ar"] .label { letter-spacing: 0; font-size: 13px; }',
    '.rail ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }',
    '.rail a { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 10px; border-radius: 10px; color: inherit; text-decoration: none; }',
    '.rail a:hover { background: var(--surface-2); }',
    '.rail a[aria-current="true"] { background: var(--primary-soft); }',
    '.rail .name { font-weight: 600; font-size: 14px; min-width: 0; }',
    '.rail .bar { grid-column: 1 / -1; height: 4px; }',
    '.rail .flag { grid-column: 1 / -1; font-size: 12px; font-weight: 700; color: var(--fail); display: inline-flex; align-items: center; gap: 4px; }',
    '.rail .flag svg.i { width: 14px; height: 14px; }',
    '.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }',
    '.summary { padding: 20px; display: grid; gap: 16px; }',
    '.summary > * { min-width: 0; }',
    '.page-title { font-size: clamp(22px, 3vw, 28px); line-height: 1.25; margin: 0; text-wrap: balance; }',
    '.intro { color: var(--muted); max-width: 72ch; }',
    '.intro p { margin: 0 0 8px; } .intro p:last-child { margin-bottom: 0; }',
    '.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 10px 0 0; padding: 0; list-style: none; font-size: 14px; }',
    '.legend li { display: inline-flex; align-items: center; gap: 6px; }',
    '.legend b { font-variant-numeric: tabular-nums; }',
    '.legend [data-legend="pass"] svg { color: var(--pass); } .legend [data-legend="fail"] svg { color: var(--fail); } .legend [data-legend="blocked"] svg { color: var(--blocked); } .legend [data-legend="na"] svg, .legend [data-legend="todo"] svg { color: var(--muted); }',
    '.run { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }',
    '.field label { display: block; font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }',
    '.field input { width: 100%; min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); }',
    '.actions { display: flex; flex-wrap: wrap; gap: 8px; }',
    'details.how { border-top: 1px solid var(--line); padding-top: 12px; }',
    'details.how summary { cursor: pointer; font-weight: 600; min-height: 32px; }',
    'details.how ol { margin: 8px 0 0; padding-inline-start: 22px; display: grid; gap: 4px; }',
    '.fail-note { background: var(--warn-soft); border-radius: 10px; padding: 10px 14px; margin: 12px 0 0; }',
    '.fail-note strong:first-child { color: var(--warn); }',
    '.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 8px; }',
    '.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-size: 14px; font-weight: 600; white-space: nowrap; }',
    '.chip[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }',
    '.chip .n { font-variant-numeric: tabular-nums; opacity: .75; }',
    '.empty { padding: 24px; text-align: center; color: var(--muted); }',
    '.section { margin-top: 24px; scroll-margin-top: calc(var(--top) + 16px); }',
    '.section-head { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; }',
    '.section-head h2 { font-size: 20px; margin: 0; flex: 1; }',
    '.section-head .bar { flex: 0 1 160px; height: 6px; }',
    '.checks { display: grid; gap: 12px; }',
    '.check { border-inline-start: 4px solid var(--todo); scroll-margin-top: calc(var(--top) + 16px); }',
    '.check[data-status="pass"] { border-inline-start-color: var(--pass); }',
    '.check[data-status="fail"] { border-inline-start-color: var(--fail); }',
    '.check[data-status="blocked"] { border-inline-start-color: var(--blocked); }',
    '.check[data-status="na"] { border-inline-start-color: var(--na); }',
    '.check-head { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; }',
    '.num { font: 700 13px/1 ui-monospace, "Cascadia Code", Consolas, monospace; color: var(--muted); background: var(--surface-2); border-radius: 6px; padding: 6px 7px; flex: none; margin-top: 1px; }',
    '.check-title { flex: 1; min-width: 0; margin: 0; font-size: 16px; font-weight: 650; line-height: 1.45; }',
    '.toggle { background: none; border: 0; padding: 0; text-align: start; cursor: pointer; width: 100%; font: inherit; }',
    '.status-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 99px; font-size: 13px; font-weight: 700; white-space: nowrap; flex: none; background: var(--surface-2); color: var(--muted); }',
    '.status-tag:empty { display: none; }',
    '.status-tag[data-s="pass"] { background: var(--pass-soft); color: var(--pass); }',
    '.status-tag[data-s="fail"] { background: var(--fail-soft); color: var(--fail); }',
    '.status-tag[data-s="blocked"] { background: var(--blocked-soft); color: var(--blocked); }',
    '.status-tag[data-s="na"] { background: var(--na-soft); color: var(--na); }',
    '.check-body { padding: 0 16px 16px; display: grid; gap: 10px; }',
    '.check-body > * { min-width: 0; }',
    '.check[data-collapsed="true"] .check-body { display: none; }',
    '.label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 4px 0 0; }',
    '.steps { margin: 0; padding-inline-start: 22px; display: grid; gap: 8px; }',
    '.where { display: inline-flex; align-items: center; font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 6px; background: var(--primary-soft); color: var(--ink); margin-inline-end: 6px; white-space: nowrap; vertical-align: 1px; }',
    '.expect { margin: 0; padding: 12px 14px; list-style: none; display: grid; gap: 6px; background: var(--surface-2); border-radius: 10px; }',
    '.expect li { position: relative; padding-inline-start: 26px; }',
    '.expect li::before { content: ""; position: absolute; inset-inline-start: 0; top: .3em; width: 16px; height: 16px; background: var(--primary);',
    '  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'black\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M5 12l5 5 9-10\'/%3E%3C/svg%3E") center / contain no-repeat;',
    '          mask: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'black\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M5 12l5 5 9-10\'/%3E%3C/svg%3E") center / contain no-repeat; }',
    'code { font: .9em ui-monospace, "Cascadia Code", Consolas, monospace; background: var(--code); padding: 1px 5px; border-radius: 5px; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }',
    '.code { position: relative; }',
    '.code pre { margin: 0; padding: 12px 84px 12px 14px; background: var(--code); border-radius: 10px; overflow-x: auto; direction: ltr; text-align: left; }',
    '.code pre code { background: none; padding: 0; white-space: pre; overflow-wrap: normal; }',
    '.code .copy { position: absolute; top: 6px; right: 6px; min-height: 32px; padding: 0 10px; font-size: 13px; }',
    '.result { display: grid; gap: 10px; padding-top: 14px; margin-top: 4px; border-top: 1px solid var(--line); }',
    '.seg { display: flex; flex-wrap: wrap; gap: 8px; border: 0; margin: 0; padding: 0; min-width: 0; }',
    '.seg legend { font-size: 14px; font-weight: 700; margin-bottom: 8px; padding: 0; }',
    '.seg label { position: relative; }',
    '.seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }',
    '.seg span.opt { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); font-weight: 600; font-size: 14px; }',
    '.seg input:focus-visible + span.opt { outline: 3px solid var(--ring); outline-offset: 2px; }',
    '.seg label:hover span.opt { border-color: var(--primary); }',
    '.seg input:checked + span.opt { border-width: 2px; }',
    '.seg .o-pass input:checked + span.opt { background: var(--pass-soft); border-color: var(--pass); color: var(--pass); }',
    '.seg .o-fail input:checked + span.opt { background: var(--fail-soft); border-color: var(--fail); color: var(--fail); }',
    '.seg .o-blocked input:checked + span.opt { background: var(--blocked-soft); border-color: var(--blocked); color: var(--blocked); }',
    '.seg .o-na input:checked + span.opt { background: var(--na-soft); border-color: var(--na); color: var(--na); }',
    '.result-note label { font-size: 14px; font-weight: 600; display: block; margin-bottom: 4px; }',
    '.result-note textarea { width: 100%; min-height: 72px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); resize: vertical; }',
    '.result-note .hint { font-size: 13px; color: var(--muted); margin: 4px 0 0; }',
    '.check-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }',
    '.linkbtn { background: none; border: 0; color: var(--primary); cursor: pointer; font-weight: 600; font-size: 14px; display: inline-flex; gap: 6px; align-items: center; min-height: 32px; padding: 0 4px; }',
    '@media (max-width: 560px) {',
    '  .summary { padding: 16px; } .check-head { padding: 12px; } .check-body { padding: 0 12px 12px; }',
    '  .seg span.opt { min-height: 44px; }',
    '  .code { display: flex; flex-direction: column; gap: 6px; } .code .copy { position: static; align-self: flex-end; } .code pre { padding-right: 14px; }',
    '}',
    '@media print {',
    '  .top, .rail, .filters, .actions, .seg, .copy, .linkbtn, .skip, .toggle-hint { display: none !important; }',
    '  body { background: #fff; } .wrap { display: block; padding: 0; } .card { box-shadow: none; break-inside: avoid; }',
    '  .check[data-collapsed="true"] .check-body { display: grid; } .check[hidden], .section[hidden] { display: block !important; }',
    '  details.how { display: none; } .result-note[hidden] { display: none; } .result { border: 0; padding: 0; }',
    '}'
  ].join('\n');

  var ICONS = {
    pass: '<path d="M5 12l5 5 9-10"/>',
    fail: '<path d="M6 6l12 12M18 6L6 18"/>',
    blocked: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    na: '<path d="M6 12h12"/>',
    todo: '<circle cx="12" cy="12" r="8"/>',
    next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'
  };

  var STATUS_LABELS = {
    en: { todo: 'To do', pass: 'Pass', fail: 'Fail', blocked: 'Blocked', na: 'Not applicable' },
    ar: { todo: 'لم يُنفَّذ', pass: 'نجح', fail: 'فشل', blocked: 'متوقف', na: 'لا ينطبق' }
  };

  /**
   * Runs first, in <head>: the language and theme the tester chose last time
   * (or ?lang=ar), applied before anything is drawn.
   */
  function headScript(KEY) {
    var root = document.documentElement, lang = null, theme = null;
    try { var q = new URLSearchParams(location.search).get('lang'); if (q === 'ar' || q === 'en') { lang = q; } } catch (e) {}
    try { lang = lang || localStorage.getItem(KEY + ':lang'); theme = localStorage.getItem(KEY + ':theme'); } catch (e) {}
    if (lang === 'ar') { root.lang = 'ar'; root.dir = 'rtl'; root.dataset.lang = 'ar'; }
    if (theme === 'dark' || theme === 'light') { root.dataset.theme = theme; }
  }

  /**
   * Everything the tester does on the page. Self-contained: it is copied
   * into the page as source text, so it must not use anything from the
   * engine around it.
   */
  function pageScript(KEY, TITLES, LABELS, ICONS) {
    var root = document.documentElement;
    var STATUSES = ['pass', 'fail', 'blocked', 'na'];
    var S = {
      en: {
        done: '{d} of {n} done', marked: 'Check {num}: {s}. {d} of {n} done.', allDone: 'Every check has a result.',
        copied: 'Copied', copy: 'Copy', confirmReset: 'Clear every result and note on this checklist?',
        report: { tester: 'Tested by', env: 'Server and build', date: 'Date', summary: 'Results', todo: 'Not run yet' },
        showing: 'Showing {f}: {n} checks.'
      },
      ar: {
        done: '{d} من {n} منجز', marked: 'الفحص {num}: {s}. {d} من {n} منجز.', allDone: 'كل الفحوصات لها نتيجة.',
        copied: 'تم النسخ', copy: 'نسخ', confirmReset: 'هل تريد مسح كل النتائج والملاحظات في هذه القائمة؟',
        report: { tester: 'المختبِر', env: 'الخادم والإصدار', date: 'التاريخ', summary: 'النتائج', todo: 'لم يُنفَّذ بعد' },
        showing: 'عرض {f}: {n} فحص.'
      }
    };

    function $(id) { return document.getElementById(id); }
    function all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
    function lang() { return root.dataset.lang === 'ar' ? 'ar' : 'en'; }
    function fmt(s, v) { return s.replace(/\{(\w+)\}/g, function (_, k) { return v[k]; }); }
    function svg(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }
    function both(en, ar) { return '<span class="en">' + en + '</span><span class="ar">' + ar + '</span>'; }
    function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function fetchStored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

    /* Results, with the first page format's ticks ({key: tickedAt}) read as Pass. */
    var state = {};
    try { state = JSON.parse(fetchStored(KEY) || '{}') || {}; } catch (e) { state = {}; }
    if (!state.results || typeof state.results !== 'object') {
      var ticks = state;
      state = { results: {} };
      Object.keys(ticks).forEach(function (k) {
        if (ticks[k]) { state.results[k] = { s: 'pass', at: typeof ticks[k] === 'number' ? ticks[k] : Date.now() }; }
      });
    }
    state.filter = state.filter || 'all';
    function save() { store(KEY, JSON.stringify(state)); }

    var checks = all('.check');
    var sections = all('section[data-section]');
    var byKey = {};
    checks.forEach(function (el) { byKey[el.dataset.key] = el; });

    function status(key) { return (state.results[key] || {}).s || 'todo'; }
    function counts(list) {
      var c = { pass: 0, fail: 0, blocked: 0, na: 0, todo: 0 };
      list.forEach(function (el) { c[status(el.dataset.key)]++; });
      c.n = list.length;
      c.d = c.n - c.todo;
      return c;
    }
    function bar(el, c) {
      if (!el) { return; }
      el.innerHTML = STATUSES.map(function (s) {
        return c[s] ? '<span class="s-' + s + '" style="width:' + (c[s] / c.n * 100) + '%"></span>' : '';
      }).join('');
    }
    function setOpen(el, open) {
      el.dataset.collapsed = String(!open);
      el.querySelector('.toggle').setAttribute('aria-expanded', String(open));
    }

    /** One check's result, tag, note and fold. */
    function paint(el, fold) {
      var key = el.dataset.key, s = status(key), r = state.results[key] || {};
      el.dataset.status = s;
      var tag = el.querySelector('.status-tag');
      tag.dataset.s = s;
      tag.innerHTML = svg(s) + both(LABELS.en[s], LABELS.ar[s]);
      all('.seg input', el).forEach(function (input) { input.checked = input.value === s; });
      var note = el.querySelector('.result-note'), area = note.querySelector('textarea');
      if (document.activeElement !== area) { area.value = r.note || ''; }
      note.hidden = !(s === 'fail' || s === 'blocked' || r.note);
      if (fold) { setOpen(el, !(s === 'pass' || s === 'na')); }
    }

    /** Every count, bar and flag on the page. */
    function refresh() {
      var c = counts(checks);
      bar($('bar-top'), c);
      bar($('bar-main'), c);
      $('count-top').innerHTML = both(fmt(S.en.done, c), fmt(S.ar.done, c));
      all('[data-legend]').forEach(function (li) { li.querySelector('b').textContent = c[li.dataset.legend]; });
      all('[data-filter]').forEach(function (b) {
        var f = b.dataset.filter;
        b.querySelector('.n').textContent = f === 'all' ? c.n : c[f];
        b.setAttribute('aria-pressed', String(state.filter === f));
      });
      sections.forEach(function (sec) {
        var mine = checks.filter(function (el) { return el.dataset.section === sec.id; });
        var sc = counts(mine);
        bar(sec.querySelector('.section-head .bar'), sc);
        sec.querySelector('.section-head .count').textContent = sc.d + '/' + sc.n;
        var link = document.querySelector('[data-rail="' + sec.id + '"]');
        if (link) {
          bar(link.querySelector('.bar'), sc);
          link.querySelector('.count').textContent = sc.d + '/' + sc.n;
          var flag = link.querySelector('.flag');
          flag.hidden = !sc.fail;
          flag.innerHTML = svg('fail') + sc.fail + ' ' + both(LABELS.en.fail, LABELS.ar.fail);
        }
      });
    }

    /** Shows only the checks the chosen filter asks for. */
    function applyFilter() {
      var f = state.filter, shown = 0;
      checks.forEach(function (el) {
        var on = f === 'all' || status(el.dataset.key) === f;
        el.hidden = !on;
        if (on) { shown++; if (f !== 'all') { setOpen(el, true); } }
      });
      sections.forEach(function (sec) { sec.hidden = !all('.check', sec).some(function (el) { return !el.hidden; }); });
      $('empty').hidden = shown > 0;
      return shown;
    }

    function announce(text) { $('announce').textContent = text; }

    function copyText(text, btn) {
      var done = function () {
        var old = btn.innerHTML;
        btn.innerHTML = svg('pass') + both(S.en.copied, S.ar.copied);
        setTimeout(function () { btn.innerHTML = old; }, 1400);
      };
      if (navigator.clipboard && window.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); });
      } else {
        fallback();
      }
      function fallback() {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { if (document.execCommand('copy')) { done(); } } catch (e) {}
        area.remove();
      }
    }

    /** The run as Markdown, in the language on screen. */
    function report() {
      var l = lang(), s = S[l], c = counts(checks), L = LABELS[l], out = [];
      var heading = document.querySelector('.page-title .' + l);
      var title = function (el) { var t = el.querySelector('.title .' + l); return t ? t.textContent.trim() : ''; };
      out.push('# ' + (heading ? heading.textContent.trim() : TITLES[l].title), '');
      out.push('- ' + s.report.tester + ': ' + ($('tester').value.trim() || '—'));
      out.push('- ' + s.report.env + ': ' + ($('env').value.trim() || '—'));
      out.push('- ' + s.report.date + ': ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
      out.push('- ' + s.report.summary + ': ' + ['pass', 'fail', 'blocked', 'na', 'todo'].map(function (k) { return L[k] + ' ' + c[k]; }).join(' · '), '');
      ['fail', 'blocked', 'na'].forEach(function (k) {
        var list = checks.filter(function (el) { return status(el.dataset.key) === k; });
        if (!list.length) { return; }
        out.push('## ' + L[k] + ' (' + list.length + ')');
        list.forEach(function (el) {
          var note = (state.results[el.dataset.key] || {}).note;
          out.push('- **' + el.dataset.num + '** ' + title(el) + (note ? ' — ' + note.trim().replace(/\s*\n\s*/g, ' ') : ''));
        });
        out.push('');
      });
      var todo = checks.filter(function (el) { return status(el.dataset.key) === 'todo'; });
      if (todo.length) {
        out.push('## ' + s.report.todo + ' (' + todo.length + ')', todo.map(function (el) { return el.dataset.num; }).join(', '), '');
      }
      return out.join('\n');
    }

    function setLang(l) {
      if (l === 'ar') { root.dataset.lang = 'ar'; } else { delete root.dataset.lang; }
      root.lang = l;
      root.dir = l === 'ar' ? 'rtl' : 'ltr';
      document.title = TITLES[l].title;
      store(KEY + ':lang', l);
    }

    function openFromHash() {
      var target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (target && target.classList.contains('check')) {
        if (target.hidden) { state.filter = 'all'; save(); applyFilter(); refresh(); }
        setOpen(target, true);
        target.scrollIntoView();
      }
    }

    /* ── events ── */
    document.addEventListener('change', function (e) {
      var input = e.target;
      if (!input.matches || !input.matches('.seg input')) { return; }
      var el = input.closest('.check'), key = el.dataset.key;
      state.results[key] = Object.assign({}, state.results[key], { s: input.value, at: Date.now() });
      save();
      paint(el, false);
      refresh();
      var c = counts(checks);
      announce(fmt(S[lang()].marked, { num: el.dataset.num, s: LABELS[lang()][input.value], d: c.d, n: c.n }));
      if (input.value === 'fail' || input.value === 'blocked') { el.querySelector('.result-note textarea').focus(); }
    });

    document.addEventListener('input', function (e) {
      var area = e.target;
      if (area.matches && area.matches('.result-note textarea')) {
        var key = area.closest('.check').dataset.key;
        state.results[key] = Object.assign({ s: 'todo' }, state.results[key], { note: area.value });
        save();
      } else if (area.id === 'tester' || area.id === 'env') {
        state[area.id] = area.value;
        save();
      }
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button');
      if (!btn) { return; }
      var el = btn.closest('.check');

      if (btn.classList.contains('toggle')) {
        setOpen(el, el.dataset.collapsed === 'true');
      } else if (btn.classList.contains('copy')) {
        copyText(btn.parentNode.querySelector('code').textContent, btn);
      } else if (btn.hasAttribute('data-link')) {
        copyText(location.href.split('#')[0] + '#' + el.id, btn);
      } else if (btn.hasAttribute('data-filter')) {
        state.filter = btn.dataset.filter;
        save();
        var shown = applyFilter();
        refresh();
        var f = btn.dataset.filter;
        announce(fmt(S[lang()].showing, { f: f === 'all' ? (lang() === 'ar' ? 'الكل' : 'All') : LABELS[lang()][f], n: shown }));
      } else if (btn.id === 'next') {
        var next = checks.filter(function (x) { return status(x.dataset.key) === 'todo'; })[0];
        if (!next) { announce(S[lang()].allDone); return; }
        if (next.hidden) { state.filter = 'all'; save(); applyFilter(); refresh(); }
        setOpen(next, true);
        next.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        next.querySelector('.toggle').focus({ preventScroll: true });
      } else if (btn.id === 'report') {
        copyText(report(), btn);
      } else if (btn.id === 'print') {
        window.print();
      } else if (btn.id === 'reset') {
        if (!confirm(S[lang()].confirmReset)) { return; }
        state.results = {};
        save();
        checks.forEach(function (x) { paint(x, true); });
        refresh();
      } else if (btn.id === 'lang') {
        setLang(lang() === 'ar' ? 'en' : 'ar');
      } else if (btn.id === 'theme') {
        var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        root.dataset.theme = dark ? 'light' : 'dark';
        store(KEY + ':theme', root.dataset.theme);
      }
    });

    /* The section list follows the reader. */
    if ('IntersectionObserver' in window) {
      var current = null;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { current = en.target.id; } });
        all('[data-rail]').forEach(function (a) { a.setAttribute('aria-current', String(a.dataset.rail === current)); });
      }, { rootMargin: '-30% 0px -60% 0px' });
      sections.forEach(function (sec) { observer.observe(sec); });
    }

    window.addEventListener('hashchange', openFromHash);

    $('tester').value = state.tester || '';
    $('env').value = state.env || '';
    document.title = TITLES[lang()].title;
    checks.forEach(function (el) { paint(el, true); });
    applyFilter();
    refresh();
    openFromHash();
  }

  /** A normalised page as the complete HTML document. Texts are trusted HTML; code is escaped. */
  function render(page) {
    var o = [];
    var p = function (s) { o.push(s); };
    var both = function (en, ar) { return '<span class="en">' + en + '</span><span class="ar">' + ar + '</span>'; };
    var pair = function (v) { return both(v.en, v.ar); };
    var icon = function (n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; };
    var L = STATUS_LABELS;
    var key = JSON.stringify(page.storage_key);

    p('<!doctype html>');
    p('<html lang="en" dir="ltr">');
    p('<head>');
    p('<meta charset="utf-8">');
    p('<meta name="viewport" content="width=device-width, initial-scale=1">');
    p('<meta name="generator" content="checklist-generator; page format 2">');
    p('<title>' + esc(page.title.en) + '</title>');
    p('<script>\nvar KEY = ' + key + ';\n(' + headScript.toString() + ')(KEY);\n</' + 'script>');
    p('<style>\n' + STYLE + '\n</style>');
    p('</head>');
    p('<body>');
    p('<a class="skip" href="#main">' + both('Skip to the checks', 'انتقل إلى الفحوصات') + '</a>');

    // Top bar: where am I, how far am I, what is next.
    p('<header class="top"><div class="top-in">');
    p('  <span class="top-title">' + pair(page.heading) + '</span>');
    p('  <div class="top-progress" aria-hidden="true"><div class="bar" id="bar-top"></div><span class="count" id="count-top"></span></div>');
    p('  <button class="btn" type="button" id="next">' + icon('next') + '<span class="lbl-sm">' + both('Next to do', 'الفحص التالي') + '</span></button>');
    p('  <button class="btn icon" type="button" id="lang"><span class="en" lang="ar" aria-hidden="true">ع</span><span class="ar" lang="en" aria-hidden="true">EN</span><span class="sr-only">' + both('العربية — switch to Arabic', 'English — التبديل إلى الإنجليزية') + '</span></button>');
    p('  <button class="btn icon" type="button" id="theme">' + icon('theme') + '<span class="sr-only">' + both('Switch light or dark theme', 'تبديل المظهر الفاتح أو الداكن') + '</span></button>');
    p('</div></header>');

    p('<div class="wrap">');

    // Section list, kept on screen on wide screens.
    p('<nav class="rail" aria-labelledby="rail-h"><h2 id="rail-h">' + both('Sections', 'الأقسام') + '</h2><ol>');
    page.sections.forEach(function (s) {
      p('  <li><a href="#' + esc(s.id) + '" data-rail="' + esc(s.id) + '"><span class="name"><bdi dir="ltr">' + s.number + '.</bdi> ' + pair(s.name) + '</span><span class="count"></span><span class="flag" hidden></span><span class="bar" aria-hidden="true"></span></a></li>');
    });
    p('</ol></nav>');

    p('<main id="main" tabindex="-1">');

    // Summary: what this is, the run, the results so far, the report.
    p('<section class="card summary" aria-labelledby="page-title">');
    p('  <h1 class="page-title" id="page-title">' + pair(page.heading) + '</h1>');
    p('  <div class="intro"><div class="en">' + page.intro.en + '</div><div class="ar">' + page.intro.ar + '</div></div>');
    p('  <div><div class="bar" id="bar-main" style="height:12px" aria-hidden="true"></div><ul class="legend">');
    ['pass', 'fail', 'blocked', 'na', 'todo'].forEach(function (s) {
      p('    <li data-legend="' + s + '">' + icon(s) + both(L.en[s], L.ar[s]) + ' <b>0</b></li>');
    });
    p('  </ul></div>');
    p('  <div class="run">');
    p('    <div class="field"><label for="tester">' + both('Tested by', 'المختبِر') + '</label><input id="tester" autocomplete="name" dir="auto"></div>');
    p('    <div class="field"><label for="env">' + both('Server and build', 'الخادم والإصدار') + '</label><input id="env" dir="auto" placeholder="test.example.com · v1.2.3"></div>');
    p('  </div>');
    p('  <div class="actions">');
    p('    <button class="btn primary" type="button" id="report">' + icon('copy') + both('Copy report', 'نسخ التقرير') + '</button>');
    p('    <button class="btn" type="button" id="print">' + icon('print') + both('Print', 'طباعة') + '</button>');
    p('    <button class="btn" type="button" id="reset">' + both('Clear results', 'مسح النتائج') + '</button>');
    p('  </div>');
    p('  <details class="how"><summary>' + both('How to use this page', 'طريقة استخدام هذه الصفحة') + '</summary>');
    ['en', 'ar'].forEach(function (lang) {
      p('    <div class="' + lang + '"><ol>');
      page.how_to[lang].forEach(function (line) { p('      <li>' + line + '</li>'); });
      p('    </ol><p class="fail-note ' + lang + '">' + page.fail_note[lang] + '</p></div>');
    });
    p('    <p class="toggle-hint">' + both('Your results are saved in this browser only, under both languages. <em>Clear results</em> removes them.', 'تُحفظ نتائجك في هذا المتصفح فقط، ومشتركة بين اللغتين. «مسح النتائج» يحذفها.') + '</p>');
    p('  </details>');
    p('</section>');

    // Filters.
    p('<div class="filters" role="group" aria-label="' + esc('Show') + '">');
    [['all', 'All', 'الكل'], ['todo', L.en.todo, L.ar.todo], ['fail', L.en.fail, L.ar.fail], ['blocked', L.en.blocked, L.ar.blocked]].forEach(function (f) {
      p('  <button class="chip" type="button" data-filter="' + f[0] + '" aria-pressed="' + (f[0] === 'all') + '">' + both(f[1], f[2]) + ' <span class="n"></span></button>');
    });
    p('</div>');
    p('<p class="card empty" id="empty" hidden>' + both('Nothing here with this filter.', 'لا شيء هنا بهذه التصفية.') + '</p>');

    // Sections and checks.
    page.sections.forEach(function (s) {
      p('<section class="section" id="' + esc(s.id) + '" data-section aria-labelledby="' + esc(s.id) + '-h">');
      p('  <div class="section-head"><h2 id="' + esc(s.id) + '-h"><bdi dir="ltr">' + s.number + '.</bdi> ' + pair(s.name) + '</h2><div class="bar" aria-hidden="true"></div><span class="count"></span></div>');
      p('  <div class="checks">');
      s.items.forEach(function (it) {
        var id = 'c-' + slug(it.key);
        p('  <article class="card check item" id="' + id + '" data-key="' + esc(it.key) + '" data-num="' + it.number + '" data-section="' + esc(s.id) + '" data-status="todo" aria-labelledby="' + id + '-t">');
        p('    <div class="head check-head"><span class="num"><bdi dir="ltr">' + it.number + '</bdi></span>');
        p('      <h3 class="check-title" id="' + id + '-t"><button class="toggle" type="button" aria-expanded="true" aria-controls="' + id + '-b"><span class="title">' + pair(it.title) + '</span></button></h3>');
        p('      <span class="status-tag" data-s="todo"></span></div>');
        p('    <div class="body check-body" id="' + id + '-b">');
        p('      <p class="label">' + both('Steps', 'الخطوات') + '</p>');
        [['en', 0], ['ar', 1]].forEach(function (l) {
          p('      <ol class="steps ' + l[0] + '">');
          it.steps.forEach(function (st) { p('        <li><span class="where">' + esc(st.place[l[1]]) + '</span> ' + st[l[0]] + '</li>'); });
          p('      </ol>');
        });
        it.code.forEach(function (c) {
          p('      <div class="code"><pre><code>' + esc(c) + '</code></pre><button class="btn copy" type="button">' + both('Copy', 'نسخ') + '</button></div>');
        });
        p('      <p class="label">' + both('You should see', 'النتيجة المتوقعة') + '</p>');
        ['en', 'ar'].forEach(function (lang) {
          p('      <ul class="expect ' + lang + '">');
          it.expect.forEach(function (e) { p('        <li>' + e[lang] + '</li>'); });
          p('      </ul>');
        });
        p('      <div class="result">');
        p('        <fieldset class="seg"><legend>' + both('Result', 'النتيجة') + '</legend>');
        ['pass', 'fail', 'blocked', 'na'].forEach(function (st) {
          p('          <label class="o-' + st + '"><input type="radio" name="r-' + id + '" value="' + st + '"><span class="opt">' + icon(st) + both(L.en[st], L.ar[st]) + '</span></label>');
        });
        p('        </fieldset>');
        p('        <div class="result-note" hidden><label for="' + id + '-n">' + both('What did you see?', 'ماذا رأيت؟') + '</label><textarea id="' + id + '-n" dir="auto" aria-describedby="' + id + '-h"></textarea><p class="hint" id="' + id + '-h">' + both('A record number, the message, a screenshot name. It goes into the report.', 'رقم السجل أو الرسالة أو اسم لقطة الشاشة. تدخل في التقرير.') + '</p></div>');
        p('        <div class="check-foot"><button class="linkbtn" type="button" data-link>' + icon('link') + both('Copy link', 'نسخ الرابط') + '</button></div>');
        p('      </div>');
        p('    </div>');
        p('  </article>');
      });
      p('  </div>');
      p('</section>');
    });

    p('</main>');
    p('</div>');
    p('<div class="sr-only" role="status" aria-live="polite" id="announce"></div>');

    var titles = '{\n  en: { title: ' + JSON.stringify(page.title.en) + ' },\n  ar: { title: ' + JSON.stringify(page.title.ar) + ' }\n}';
    p('<script>\n(' + pageScript.toString() + ')(KEY, ' + titles + ', ' + JSON.stringify(STATUS_LABELS) + ', ' + JSON.stringify(ICONS) + ');\n</' + 'script>');
    p('</body>');
    p('</html>');

    return o.join('\n') + '\n';
  }

  /** Validates and renders in one call. */
  function build(spec, name, config) {
    var result = normalise(spec, name, config);
    return { html: result.page ? render(result.page) : null, problems: result.problems, page: result.page };
  }

  /**
   * An existing checklist page read back into a source: pages of this
   * format, pages of the first format, and hand-written ones of that
   * structure. A step label the project does not know becomes an entry
   * under "places". parse: html string → Document (DOMParser in a browser).
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
    var unquote = function (s) { try { return JSON.parse('"' + s + '"'); } catch (e) { return s; } };
    spec.title = { en: titleEn ? unquote(titleEn) : doc.title, ar: titleAr ? unquote(titleAr) : doc.title };

    var h1 = both(doc.querySelector('.page-title') || doc.querySelector('.top h1'));
    spec.heading = { en: trim(h1.en), ar: trim(h1.ar) };

    var intro = { en: '', ar: '' }, howTo = { en: [], ar: [] }, note = { en: '', ar: '' };
    ['en', 'ar'].forEach(function (lang) {
      var box = doc.querySelector('.intro > div.' + lang);
      if (box) {
        if (box.querySelector(':scope > h3')) {
          // First format: intro, then "How to use" in the same box.
          var parts = [];
          for (var n = box.firstElementChild; n && n.tagName !== 'H3'; n = n.nextElementSibling) { parts.push(n.outerHTML); }
          intro[lang] = parts.join('');
        } else {
          intro[lang] = trim(box.innerHTML);
        }
      }
      var ol = doc.querySelector('details.how > div.' + lang + ' > ol') || (box && box.querySelector('h3 + ol'));
      if (ol) {
        // The legend line is rebuilt on every build; the rest is kept.
        howTo[lang] = Array.prototype.map.call(ol.children, function (li) { return trim(li.innerHTML); })
          .filter(function (line) { return line.indexOf('class="where"') === -1; });
      }
      var noteEl = doc.querySelector('.fail-note.' + lang) || doc.querySelector('.intro .note.' + lang);
      if (noteEl) { note[lang] = trim(noteEl.innerHTML); }
    });
    spec.intro = intro;
    spec.how_to = howTo;
    if (note.en && note.ar) { spec.fail_note = note; }

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
