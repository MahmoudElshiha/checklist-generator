'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../checklist-engine.js');

const t = (en, ar) => ({ en, ar: ar || en + ' (ar)' });

function source(extra) {
  return {
    title: t('Feature Checks'),
    heading: t('Feature — manual checks'),
    intro: t('<p>Why.</p>'),
    sections: [
      {
        title: t('Setup'),
        items: [
          {
            key: 'setup-build',
            title: t('Latest build'),
            steps: [{ where: 'server', en: 'Run <code>make</code>.', ar: 'شغّل <code>make</code>.' }],
            code: ['echo "<done>"'],
            expect: [t('No errors.')],
          },
        ],
      },
      {
        title: t('Feature'),
        items: [
          { key: 'feature-a', title: t('A'), steps: [{ where: 'website', en: 'Do A.', ar: 'نفّذ A.' }], expect: [t('A shows.')] },
          { key: 'feature-b', title: t('B'), steps: [{ where: 'api', en: 'Call B.', ar: 'استدعِ B.' }], expect: [t('B answers.')] },
        ],
      },
    ],
    ...extra,
  };
}

test('builds a valid source and numbers sections and checks', () => {
  const result = engine.build(source(), '2026-01-01-feature-manual-tests');

  assert.deepEqual(result.problems, []);
  assert.equal(result.page.sections[0].title.en, '0. Setup');
  assert.deepEqual(result.page.sections[1].items.map((i) => i.number), ['1.1', '1.2']);
  assert.equal(result.page.sections[1].id, 's1-feature');
  assert.match(result.html, /^<!doctype html>/);
  assert.equal((result.html.match(/class="item"/g) || []).length, 3);
});

test('derives the storage key from the name and the project prefix', () => {
  assert.equal(engine.build(source(), 'My Checks').page.storage_key, 'checklist-my-checks-v1');
  assert.equal(engine.build(source(), 'x', { storage_prefix: 'shop-' }).page.storage_key, 'shop-x-v1');
  assert.equal(engine.build(source({ storage_key: 'keep-me-v1' }), 'x', { storage_prefix: 'shop-' }).page.storage_key, 'keep-me-v1');
  assert.match(engine.build(source(), 'x').html, /var KEY = "checklist-x-v1"/);
});

test('reports every missing translation, not just the first', () => {
  const broken = source();
  delete broken.heading.ar;
  broken.sections[1].items[0].expect[0] = { en: 'Only English' };

  const result = engine.build(broken, 'x');

  assert.equal(result.html, null);
  assert.ok(result.problems.includes('heading: missing "ar".'));
  assert.ok(result.problems.includes('check 1.1 expectation 1: missing "ar".'));
});

test('refuses a repeated key, an unknown place, and a check without steps or expectations', () => {
  const broken = source();
  broken.sections[1].items[1].key = 'feature-a';
  broken.sections[1].items[0].steps[0].where = 'spaceship';
  broken.sections[0].items[0].steps = [];
  broken.sections[0].items[0].expect = [];

  const problems = engine.build(broken, 'x').problems;

  assert.ok(problems.some((p) => p.startsWith('check 1.2: key "feature-a" is already used by check 1.1')));
  assert.ok(problems.some((p) => p.startsWith('check 1.1 step 1: unknown place "spaceship"')));
  assert.ok(problems.includes('check 0.1: no steps.'));
  assert.ok(problems.includes('check 0.1: nothing under "expect".'));
});

test('adds project and source places, and lists only the used ones in the legend', () => {
  const custom = source();
  custom.sections[1].items[0].steps[0].where = 'till';
  custom.sections[1].items[1].steps[0].where = 'kiosk';
  custom.places = { kiosk: ['Kiosk', 'الكشك'] };

  const result = engine.build(custom, 'x', { places: { till: ['Shop till', 'نقطة البيع'] } });
  const legend = result.page.how_to.en[result.page.how_to.en.length - 1];

  assert.deepEqual(result.problems, []);
  assert.match(legend, /Server.*Shop till.*Kiosk/);
  assert.doesNotMatch(legend, /Database/);
});

test('a source\'s how_to and fail_note win over the project\'s, which win over the defaults', () => {
  const config = { how_to: { en: ['Project line'], ar: ['سطر المشروع'] }, fail_note: t('Project note') };

  const fromProject = engine.build(source(), 'x', config).page;
  assert.equal(fromProject.how_to.en[0], 'Project line');
  assert.equal(fromProject.fail_note.en, 'Project note');

  const fromSource = engine.build(source({ how_to: { en: ['Source line'], ar: ['سطر المصدر'] }, fail_note: t('Source note') }), 'x', config).page;
  assert.equal(fromSource.how_to.en[0], 'Source line');
  assert.equal(fromSource.fail_note.en, 'Source note');

  assert.equal(engine.build(source(), 'x').page.how_to.en[0], engine.DEFAULTS.how_to.en[0]);
});

test('escapes code blocks and keeps texts as HTML', () => {
  const html = engine.build(source(), 'x').html;

  assert.ok(html.includes('<pre><code>echo &quot;&lt;done&gt;&quot;</code></pre>'));
  assert.ok(html.includes('Run <code>make</code>.'));
});

test('puts the titles in the page script for the language toggle', () => {
  const html = engine.build(source({ title: t('Checks', 'فحوصات') }), 'x').html;

  assert.ok(html.includes('en: { title: "Checks"'));
  assert.ok(html.includes('ar: { title: "فحوصات"'));
});
