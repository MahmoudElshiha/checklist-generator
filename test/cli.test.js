'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'checklists.js');

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'checklists-'));
}

test('init creates a config and a first source that builds', () => {
  const dir = tempProject();

  assert.equal(run(dir, 'init').code, 0);
  assert.ok(fs.existsSync(path.join(dir, 'checklists.config.json')));

  const sources = fs.readdirSync(path.join(dir, 'checklists', 'sources'));
  assert.equal(sources.length, 1);

  const built = run(dir, 'build');
  assert.equal(built.code, 0, built.out);
  assert.ok(fs.existsSync(path.join(dir, 'checklists', sources[0].replace('.json', '.html'))));
});

test('new refuses to overwrite, check writes nothing, build fails on a bad source', () => {
  const dir = tempProject();
  run(dir, 'init');

  assert.equal(run(dir, 'new', '2026-01-01-other-manual-tests').code, 0);
  assert.notEqual(run(dir, 'new', '2026-01-01-other-manual-tests').code, 0);

  assert.equal(run(dir, 'check').code, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'checklists', '2026-01-01-other-manual-tests.html')));

  const file = path.join(dir, 'checklists', 'sources', '2026-01-01-other-manual-tests.json');
  const broken = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete broken.title.ar;
  fs.writeFileSync(file, JSON.stringify(broken));

  const result = run(dir, 'build', '2026-01-01-other-manual-tests');
  assert.equal(result.code, 1);
  assert.match(result.out, /title: missing "ar"/);
});

test('works without a config, using the default folders', () => {
  const dir = tempProject();

  assert.equal(run(dir, 'new', 'plain').code, 0);
  assert.ok(fs.existsSync(path.join(dir, 'checklists', 'sources', 'plain.json')));
  assert.equal(run(dir, 'build').code, 0);
  assert.ok(fs.existsSync(path.join(dir, 'checklists', 'plain.html')));
});

test('builds the bundled example', () => {
  const root = path.resolve(__dirname, '..');
  const result = run(root, 'check', '--config', 'examples/checklists.config.json');

  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /7 checks/);
});
