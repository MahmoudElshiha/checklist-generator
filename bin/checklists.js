#!/usr/bin/env node
/*
 * checklists — build manual-test checklist pages from JSON sources.
 * Plain Node (18+), no packages. Run `checklists help` for usage.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const engine = require('../checklist-engine.js');

const CONFIG_NAME = 'checklists.config.json';
const SCHEMA_BASE = 'https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/';
const NPM_SCRIPT = 'npx --yes github:MahmoudElshiha/checklist-generator';

const HELP = `checklists — build bilingual manual-test checklist pages from JSON sources

Usage
  checklists init                 create ${CONFIG_NAME} and a first source here,
                                  and add a "checklists" script to package.json
  checklists new <name>           create a new source from the starter
  checklists build [name...]      build every source (or the ones named) into pages
  checklists check [name...]      validate only, write nothing
  checklists help                 this text

Options
  --config <file>   use this config instead of ./${CONFIG_NAME}

Without a config file, sources are read from ./checklists/sources and pages are
written to ./checklists. Name sources date first: 2026-11-12-equipment-manual-tests.

Docs: https://github.com/MahmoudElshiha/checklist-generator#readme`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { command: argv[0] || 'help', names: [], config: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--config') {
      args.config = argv[++i];
    } else if (argv[i] === '--check') {
      args.command = 'check';
    } else if (argv[i].startsWith('--')) {
      fail('Unknown option ' + argv[i] + '\n\n' + HELP);
    } else {
      args.names.push(argv[i]);
    }
  }
  return args;
}

/** The project settings, with the folders resolved against the config's own folder. */
function loadConfig(explicit) {
  const file = path.resolve(explicit || CONFIG_NAME);
  let config = {};

  if (fs.existsSync(file)) {
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      fail(file + ' is not valid JSON: ' + e.message);
    }
  } else if (explicit) {
    fail('No config at ' + file);
  }

  const base = path.dirname(file);

  return {
    file: fs.existsSync(file) ? file : null,
    settings: config,
    sources: path.resolve(base, config.sources || 'checklists/sources'),
    output: path.resolve(base, config.output || 'checklists'),
  };
}

function starter(name) {
  return {
    $schema: SCHEMA_BASE + 'checklist.schema.json',
    title: { en: 'Feature Checks', ar: 'فحوصات الميزة' },
    heading: { en: 'Feature — manual checks', ar: 'الميزة — الفحوصات اليدوية' },
    intro: {
      en: '<p>What this checklist tests and why, in a few sentences. Name the change, the decision or ticket behind it, and anything a tester needs to know before starting.</p>',
      ar: '<p>ما الذي تختبره هذه القائمة ولماذا، في بضع جمل. اذكر التغيير والقرار أو التذكرة وراءه، وما يحتاج المختبر معرفته قبل البدء.</p>',
    },
    sections: [
      {
        title: { en: 'Setup', ar: 'التجهيز' },
        items: [
          {
            key: 'setup-build',
            title: { en: 'The test server runs the latest build', ar: 'خادم الاختبار يعمل بآخر نسخة' },
            steps: [
              { where: 'server', en: 'Deploy the branch to the test server and run its build steps.', ar: 'انشر الفرع على خادم الاختبار وشغّل خطوات البناء.' },
            ],
            expect: [
              { en: 'Every step finishes without errors.', ar: 'تنتهي كل الخطوات دون أخطاء.' },
            ],
          },
        ],
      },
      {
        title: { en: 'The feature', ar: 'الميزة' },
        items: [
          {
            key: 'feature-happy-path',
            title: { en: 'The main flow works', ar: 'المسار الرئيسي يعمل' },
            steps: [
              { where: 'website', en: 'Do the main thing the feature is for.', ar: 'نفّذ الإجراء الرئيسي للميزة.' },
            ],
            expect: [
              { en: 'Exactly what appears on screen, with the figures.', ar: 'ما يظهر على الشاشة بالضبط، مع الأرقام.' },
            ],
          },
        ],
      },
    ],
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Adds a "checklists" npm script to the package.json in `dir`, if there is one
 * and it has no such script yet. Keeps the file's indentation and line endings.
 * Returns true when package.json has the script afterwards.
 */
function addNpmScript(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) {
    return false;
  }

  const text = fs.readFileSync(file, 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (e) {
    console.log('Skipped ' + file + ': not valid JSON (' + e.message + ').');
    return false;
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return false;
  }

  if (pkg.scripts && pkg.scripts.checklists !== undefined) {
    if (pkg.scripts.checklists === NPM_SCRIPT) {
      return true;
    }
    console.log(file + ' already has a "checklists" script; left it as it is.');
    return false;
  }

  pkg.scripts = Object.assign({}, pkg.scripts, { checklists: NPM_SCRIPT });
  const indent = (text.match(/^[ \t]+(?=")/m) || ['  '])[0];
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(file, JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + eol);
  console.log('Added a "checklists" script to ' + file);
  return true;
}

function sourceFiles(dir, names) {
  if (names.length) {
    return names.map((n) => path.join(dir, path.basename(n, '.json') + '.json'));
  }
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

function build(project, names, checkOnly) {
  const files = sourceFiles(project.sources, names);

  if (files.length === 0) {
    console.log('No sources in ' + project.sources + '. Start with: checklists new <name>');
    return 0;
  }

  let failed = 0;

  for (const file of files) {
    const name = path.basename(file, '.json');
    let source;

    try {
      source = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error('✗ ' + name + ': ' + (e.code === 'ENOENT' ? 'no such source (' + file + ')' : 'not valid JSON — ' + e.message));
      failed++;
      continue;
    }

    const result = engine.build(source, name, project.settings);

    if (result.problems.length) {
      console.error('✗ ' + name + ':\n  - ' + result.problems.join('\n  - '));
      failed++;
      continue;
    }

    const checks = result.page.sections.reduce((n, s) => n + s.items.length, 0);

    if (!checkOnly) {
      fs.mkdirSync(project.output, { recursive: true });
      fs.writeFileSync(path.join(project.output, name + '.html'), result.html);
    }

    console.log('✓ ' + name + (checkOnly ? '' : '.html') + ' — ' + result.page.sections.length + ' sections, ' + checks + ' checks');
  }

  return failed ? 1 : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = loadConfig(args.config);

  switch (args.command) {
    case 'init': {
      const file = path.resolve(args.config || CONFIG_NAME);
      if (fs.existsSync(file)) {
        console.log(file + ' already exists.');
      } else {
        writeJson(file, {
          $schema: SCHEMA_BASE + 'checklists.config.schema.json',
          sources: 'checklists/sources',
          output: 'checklists',
          storage_prefix: path.basename(path.dirname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-',
          places: {},
        });
        console.log('Created ' + file);
      }
      const fresh = loadConfig(args.config);
      const today = new Date().toISOString().slice(0, 10);
      const first = path.join(fresh.sources, today + '-example-manual-tests.json');
      if (!fs.existsSync(first) && sourceFiles(fresh.sources, []).length === 0) {
        writeJson(first, starter());
        console.log('Created ' + first);
      }
      const hasScript = addNpmScript(path.dirname(file));
      console.log('Next: edit the source, then run `' + (hasScript ? 'npm run checklists build' : 'checklists build') + '`.');
      return 0;
    }

    case 'new': {
      if (args.names.length !== 1) {
        fail('Give one name: checklists new 2026-11-12-feature-manual-tests');
      }
      const file = path.join(project.sources, path.basename(args.names[0], '.json') + '.json');
      if (fs.existsSync(file)) {
        fail(file + ' already exists.');
      }
      writeJson(file, starter());
      console.log('Created ' + file);
      return 0;
    }

    case 'build':
      return build(project, args.names, false);

    case 'check':
      return build(project, args.names, true);

    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;

    default:
      fail('Unknown command "' + args.command + '"\n\n' + HELP);
  }
}

process.exitCode = main();
