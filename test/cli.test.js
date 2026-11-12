'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'checklists.js');

function run(cwd, ...args) {
  const env = Object.assign({}, process.env, { CHECKLISTS_NO_UPDATE_CHECK: '1' });
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env });
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

/** Runs the CLI with the update check on, against a fake registry that reports `latest`. */
async function buildWithRegistry(latest) {
  const http = require('http');
  const { spawn } = require('child_process');
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ name: OWN.name, version: latest }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = Object.assign({}, process.env, { npm_config_registry: 'http://127.0.0.1:' + server.address().port + '/' });
  for (const key of ['CI', 'NO_UPDATE_NOTIFIER', 'CHECKLISTS_NO_UPDATE_CHECK']) delete env[key];
  try {
    return await new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, 'build'], { cwd: tempProject(), env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('close', (code) => resolve({ code, out }));
    });
  } finally {
    server.close();
  }
}

test('build tells you how to update when a newer version is published', async () => {
  const result = await buildWithRegistry('999.0.0');
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /Update available: .* → 999\.0\.0/);
  assert.match(result.out, /npm install --save-dev checklist-generator@latest/);
});

test('build says nothing about updates when already on the latest version', async () => {
  const result = await buildWithRegistry(OWN.version);
  assert.equal(result.code, 0, result.out);
  assert.doesNotMatch(result.out, /Update available/);
});

test('build adds the CSS file named by "style" to every page, after the built-in styles', () => {
  const dir = tempProject();
  assert.equal(run(dir, 'init').code, 0);
  const configFile = path.join(dir, 'checklists.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.style = 'checklists/style.css';
  fs.writeFileSync(configFile, JSON.stringify(config));
  fs.writeFileSync(path.join(dir, 'checklists', 'style.css'), ':root { --primary: #6d28d9; } /* </style> */');

  const built = run(dir, 'build');
  assert.equal(built.code, 0, built.out);
  const page = fs.readdirSync(path.join(dir, 'checklists')).find((f) => f.endsWith('.html'));
  const html = fs.readFileSync(path.join(dir, 'checklists', page), 'utf8');
  assert.match(html, /<style id="project-style">\n:root \{ --primary: #6d28d9; \}/);
  assert.ok(html.indexOf('id="project-style"') > html.indexOf('<style>'), 'comes after the built-in styles');
  assert.equal((html.match(/<\/style>/g) || []).length, 2, 'a "</style" in the CSS cannot end the block');
});

test('build fails clearly when the "style" file is missing', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'checklists.config.json'), JSON.stringify({ style: 'nope.css' }));
  const result = run(dir, 'build');
  assert.equal(result.code, 1);
  assert.match(result.out, /cannot read the "style" file/);
});

test('build brings the agent guide up to date, but never one edited by hand', () => {
  const dir = tempProject();
  assert.equal(run(dir, 'init').code, 0);
  const guide = path.join(dir, 'checklists', 'AGENTS.md');
  const fresh = fs.readFileSync(guide, 'utf8');
  assert.match(fresh, /^<!-- checklists-generator guide [0-9a-f]{12} -->\n# Manual-test checklists/);

  // Up to date: nothing to do.
  assert.doesNotMatch(run(dir, 'build').out, /AGENTS\.md/);
  assert.equal(fs.readFileSync(guide, 'utf8'), fresh);

  // A guide from an older version (1.1 / 1.2: bare marker, older text) is replaced.
  fs.writeFileSync(guide, '<!-- checklists-generator -->\n# Manual-test checklists\n\nOld text.\n');
  assert.match(run(dir, 'build').out, /Updated checklists\/AGENTS\.md/);
  assert.equal(fs.readFileSync(guide, 'utf8'), fresh);

  // An unedited guide with older text is replaced too (CRLF checkouts count as unedited).
  const oldBody = '# Manual-test checklists\r\n\r\nOld text.\r\n';
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(oldBody.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
  fs.writeFileSync(guide, '<!-- checklists-generator guide ' + hash + ' -->\r\n' + oldBody);
  assert.match(run(dir, 'build').out, /Updated/);
  assert.equal(fs.readFileSync(guide, 'utf8'), fresh.replace(/\n/g, '\r\n'));

  // Edited by hand: left alone, with a note.
  const edited = fresh + '\nOur own rule: every check names its ticket.\n';
  fs.writeFileSync(guide, edited);
  assert.match(run(dir, 'build').out, /edited by hand/);
  assert.equal(fs.readFileSync(guide, 'utf8'), edited);

  // Not ours at all: left alone, silently.
  fs.writeFileSync(guide, '# Our agents file\n');
  assert.doesNotMatch(run(dir, 'build').out, /AGENTS\.md/);
  assert.equal(fs.readFileSync(guide, 'utf8'), '# Our agents file\n');
});
