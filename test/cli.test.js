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

const OWN = require('../package.json');

test('init adds a "checklists" script and a devDependency to an existing package.json', () => {
  const dir = tempProject();
  const pkgFile = path.join(dir, 'package.json');
  fs.writeFileSync(pkgFile, '{\r\n    "name": "app",\r\n    "scripts": {\r\n        "test": "jest"\r\n    }\r\n}\r\n');

  const result = run(dir, 'init');
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /npm install/);
  assert.match(result.out, /npm run checklists build/);

  const text = fs.readFileSync(pkgFile, 'utf8');
  const pkg = JSON.parse(text);
  assert.equal(pkg.scripts.test, 'jest');
  assert.equal(pkg.scripts.checklists, 'checklists');
  assert.equal(pkg.devDependencies[OWN.name], '^' + OWN.version);
  assert.match(text, /^ {4}"name"/m, 'keeps the indentation');
  assert.ok(!/[^\r]\n/.test(text), 'keeps CRLF line endings');

  const again = run(dir, 'init');
  assert.equal(fs.readFileSync(pkgFile, 'utf8'), text, 'running init again changes nothing');
  assert.doesNotMatch(again.out, /npm install/);
});

test('init replaces the old github: script and keeps a dependency already listed', () => {
  const dir = tempProject();
  const pkgFile = path.join(dir, 'package.json');
  fs.writeFileSync(pkgFile, JSON.stringify({
    name: 'app',
    scripts: { checklists: 'npx --yes github:MahmoudElshiha/checklist-generator' },
    devDependencies: { [OWN.name]: '1.0.0' },
  }, null, 2) + '\n');

  assert.equal(run(dir, 'init').code, 0);
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  assert.equal(pkg.scripts.checklists, 'checklists');
  assert.equal(pkg.devDependencies[OWN.name], '1.0.0');
});

test('version prints the package version', () => {
  const result = run(tempProject(), 'version');
  assert.equal(result.code, 0);
  assert.equal(result.out.trim(), OWN.version);
});

test('init leaves an existing "checklists" script and a missing package.json alone', () => {
  const dir = tempProject();
  const pkgFile = path.join(dir, 'package.json');
  const original = JSON.stringify({ name: 'app', scripts: { checklists: 'my own command' } }, null, 2) + '\n';
  fs.writeFileSync(pkgFile, original);

  assert.equal(run(dir, 'init').code, 0);
  assert.equal(fs.readFileSync(pkgFile, 'utf8'), original);

  const bare = tempProject();
  assert.equal(run(bare, 'init').code, 0);
  assert.ok(!fs.existsSync(path.join(bare, 'package.json')));
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

test('init writes an agent guide that names the project\'s folders and command', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'checklists.config.json'), JSON.stringify({ sources: 'docs/qa/sources', output: 'docs/qa' }));

  const result = run(dir, 'init');
  assert.equal(result.code, 0, result.out);

  const guide = fs.readFileSync(path.join(dir, 'docs', 'qa', 'AGENTS.md'), 'utf8');
  assert.match(guide, /`docs\/qa\/sources\/<name>\.json`/);
  assert.match(guide, /never edit them by hand/);
  assert.match(guide, /npx checklist-generator check/, 'no package.json: the npx command');
  assert.match(guide, /`mailbox`/, 'lists the built-in step labels');

  fs.writeFileSync(path.join(dir, 'docs', 'qa', 'AGENTS.md'), 'my own notes\n');
  run(dir, 'init');
  assert.equal(fs.readFileSync(path.join(dir, 'docs', 'qa', 'AGENTS.md'), 'utf8'), 'my own notes\n', 'never overwritten');
});

test('init uses the npm script in the guide when it adds one', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "app" }\n');

  assert.equal(run(dir, 'init').code, 0);
  assert.match(fs.readFileSync(path.join(dir, 'checklists', 'AGENTS.md'), 'utf8'), /npm run checklists build/);
});

test('init points an existing AGENTS.md and CLAUDE.md at the guide, once, keeping line endings', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Rules\r\nUse tabs.');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Claude\n');

  assert.equal(run(dir, 'init').code, 0);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

  assert.ok(agents.startsWith('# Rules\r\nUse tabs.\r\n'), 'keeps what was there');
  assert.match(agents, /read `checklists\/AGENTS\.md`/);
  assert.ok(!/[^\r]\n/.test(agents), 'keeps CRLF line endings');
  assert.match(claude, /read `checklists\/AGENTS\.md`/);

  run(dir, 'init');
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), agents, 'running init again adds nothing');
  assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), claude);
});

test('init names the guide CHECKLISTS.md when pages go to the project root', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'checklists.config.json'), JSON.stringify({ sources: 'sources', output: '.' }));
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Rules\n');

  assert.equal(run(dir, 'init').code, 0);
  assert.ok(fs.existsSync(path.join(dir, 'CHECKLISTS.md')));
  assert.match(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /read `CHECKLISTS\.md`/);
});
