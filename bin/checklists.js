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
const PACKAGE = require('../package.json');
const NPM_SCRIPT = 'checklists';
// What `init` wrote before the package was on npm; replaced when found.
const LEGACY_NPM_SCRIPT = 'npx --yes github:MahmoudElshiha/checklist-generator';

const HELP = `checklists — build bilingual manual-test checklist pages from JSON sources

Usage
  checklists init                 create ${CONFIG_NAME} and a first source here,
                                  and add a "checklists" script and a devDependency
                                  to package.json, and an AGENTS.md guide for AI agents
  checklists version              print the installed version
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
 * Sets up the package.json in `dir`, if there is one: adds a "checklists" npm
 * script (or replaces the old github: one) and checklist-generator as a
 * devDependency. Leaves a script or dependency the user already has alone.
 * Keeps the file's indentation and line endings.
 * Returns { script, installNeeded }: whether package.json has our script
 * afterwards, and whether a devDependency was just added (`npm install` due).
 */
function setUpPackageJson(dir) {
  const none = { script: false, installNeeded: false };
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) {
    return none;
  }

  const text = fs.readFileSync(file, 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (e) {
    console.log('Skipped ' + file + ': not valid JSON (' + e.message + ').');
    return none;
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return none;
  }

  const changes = [];
  let script = false;
  const current = pkg.scripts ? pkg.scripts.checklists : undefined;
  if (current === undefined || current === LEGACY_NPM_SCRIPT) {
    pkg.scripts = Object.assign({}, pkg.scripts, { checklists: NPM_SCRIPT });
    changes.push(current === undefined ? 'added a "checklists" script' : 'updated the "checklists" script');
    script = true;
  } else if (current === NPM_SCRIPT) {
    script = true;
  } else {
    console.log(file + ' already has a "checklists" script; left it as it is.');
  }

  let installNeeded = false;
  const listed = ['dependencies', 'devDependencies'].some((key) => pkg[key] && pkg[key][PACKAGE.name] !== undefined);
  if (script && !listed) {
    pkg.devDependencies = Object.assign({}, pkg.devDependencies, { [PACKAGE.name]: '^' + PACKAGE.version });
    changes.push('added ' + PACKAGE.name + ' to devDependencies');
    installNeeded = true;
  }

  if (changes.length) {
    const indent = (text.match(/^[ \t]+(?=")/m) || ['  '])[0];
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(file, JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + eol);
    console.log(file + ': ' + changes.join(', ') + '.');
  }
  return { script, installNeeded };
}

const GUIDE_MARKER = '<!-- checklists-generator -->';

/** A project-relative path with forward slashes, for text an agent will read. */
function rel(root, target) {
  return path.relative(root, target).split(path.sep).join('/') || '.';
}

/** Instructions for AI coding agents (and people) working in a project that uses this tool. */
function agentGuide(project, root, run, explicitConfig) {
  const sources = rel(root, project.sources);
  const output = rel(root, project.output);
  const config = project.file ? rel(root, project.file) : 'checklists.config.json';
  const opt = explicitConfig ? (run.startsWith('npm ') ? ' -- --config ' : ' --config ') + config : '';
  const cmd = (c) => run + ' ' + c + opt;
  const builtIn = Object.keys(engine.DEFAULTS.places).map((k) => '`' + k + '`').join(', ');

  return `${GUIDE_MARKER}
# Manual-test checklists

This folder holds bilingual (English / Arabic) manual-test checklists, built with
[checklist-generator](https://github.com/MahmoudElshiha/checklist-generator).
Read this before adding or changing a checklist.

## Files

- \`${sources}/<name>.json\`: the **sources**. This is the only thing you edit.
- \`${output}/<name>.html\`: the **pages** testers open. They are generated: **never edit them by hand**.
  Change the source and rebuild.
- \`${config}\`: project settings (step labels under \`places\`, defaults).

Name sources date first, lowercase with dashes: \`2026-11-12-login-manual-tests\`.

## Commands

Run from the folder that holds \`${path.basename(config)}\`:

\`\`\`bash
${cmd('new 2026-11-12-login-manual-tests')}   # new source from the starter
${cmd('check')}                               # validate every source, write nothing
${cmd('build')}                               # validate and write every page
${cmd('build 2026-11-12-login-manual-tests')}  # just one
\`\`\`

\`check\` and \`build\` print every problem with its location (\`check 2.3: missing "ar"\`) and exit
with code 1. Loop until \`check\` passes, then \`build\`. Commit the source **and** the page.

## Source format

The full JSON Schema is linked from every source's \`$schema\`:
https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/checklist.schema.json

\`\`\`
{ title, heading, intro,                     // every text is { "en": "…", "ar": "…" }; both required
  sections: [ { title, items: [
    { key,                                   // unique, lowercase-with-dashes, stable
      title,                                 // what the check proves, as a sentence
      steps: [ { where, en, ar } ],          // what to do, in order
      code,                                  // optional: string or list of strings, plain text
      expect: [ { en, ar } ] } ] } ] }       // what the tester must see
\`\`\`

- **Every text needs both \`en\` and \`ar\`.** Write real Arabic, not a copy of the English. A source missing one is refused.
- Texts may contain HTML (\`<code>\`, \`<strong>\`, \`<em>\`, \`<a>\`; \`<p>\` in \`intro\`). Write a literal \`<\` as \`&lt;\`.
- **Never write numbers** in section or check titles: "Setup", not "0. Setup". Numbers are added when the page is built.
- **Never change an existing \`key\`** when rewording a check. Testers' results are saved under it.
  Do not rename an existing source file either: its results are saved under the file name.
- \`where\` is a step label: built in ${builtIn}, plus any under \`places\` in \`${config}\` or in the source.
  Add a new one as \`"places": { "kiosk": ["Kiosk", "الكشك"] }\`.
- Put commands, SQL, JSON and URLs in \`code\` (it gets a Copy button), with placeholders in braces: \`{order-id}\`.
  Code is plain text, so don't escape it.

## Writing good checks

- **Section 0 is Setup**: deploy, migrations (exact commands), test data, accounts. Everything else assumes it.
- **Use fixed test data and worked-out figures.** "Total 135.00, to pay 185.00" beats "the total is right".
  Say in \`intro\` what the figures assume, and name the change or ticket being tested.
- **One check proves one thing**, and its title says what.
- **Every \`expect\` line can be seen**: a message on screen, a figure, a row in a table, a field in a response. Never "it works".
- **Cover the refusals** (wrong input, limits, expired or duplicate) with the exact message, not only the happy path.
`;
}

/**
 * Writes the agent guide into the pages folder (unless one is there) and points
 * the project's own AGENTS.md / CLAUDE.md at it, if they exist.
 */
function writeAgentGuide(project, root, run, explicitConfig) {
  const dir = project.output;
  const file = path.join(dir, path.resolve(dir) === path.resolve(root) ? 'CHECKLISTS.md' : 'AGENTS.md');

  if (fs.existsSync(file)) {
    console.log(file + ' already exists; left it as it is.');
  } else {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, agentGuide(project, root, run, explicitConfig));
    console.log('Created ' + file + ' (instructions for AI agents and people)');
  }

  const pointer = '\n' + GUIDE_MARKER + '\n## Manual-test checklists\n\n' +
    'Manual-test checklists are JSON sources built into HTML pages. Before adding or changing one, read `' +
    rel(root, file) + '`. Never edit the generated `.html` pages by hand.\n';

  let pointed = false;
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const own = path.join(root, name);
    if (own === file || !fs.existsSync(own)) {
      continue;
    }
    pointed = true;
    const text = fs.readFileSync(own, 'utf8');
    if (text.includes(GUIDE_MARKER)) {
      continue;
    }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const sep = text === '' || text.endsWith('\n') ? '' : eol;
    fs.writeFileSync(own, text + sep + pointer.replace(/\n/g, eol));
    console.log('Added a pointer to the checklist guide in ' + own);
  }
  if (!pointed) {
    console.log('Tip: if you use an AI coding agent, point your AGENTS.md or CLAUDE.md at ' + rel(root, file) +
      ' (run `init` again once one exists and it adds the pointer).');
  }
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
      const setup = setUpPackageJson(path.dirname(file));
      writeAgentGuide(fresh, path.dirname(file), setup.script ? 'npm run checklists' : 'npx ' + PACKAGE.name, !!args.config);
      console.log('Next: ' + (setup.installNeeded ? 'run `npm install`, ' : '') +
        'edit the source, then run `' + (setup.script ? 'npm run checklists build' : 'checklists build') + '`.');
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

    case 'version':
    case '--version':
    case '-v':
      console.log(PACKAGE.version);
      return 0;

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
