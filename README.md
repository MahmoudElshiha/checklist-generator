# checklist-generator

Build **bilingual (English / Arabic) manual-test checklists** — the pages a tester opens to run a feature by hand — from a short JSON file.

You write only the scenarios: what to do, where, and what you should see. The generator turns them into one self-contained HTML page that testers open in any browser:

- an English ⇄ Arabic toggle (the Arabic view is right-to-left);
- numbered checks, each taking a result — **Pass, Fail, Blocked or Not applicable** — and a note, saved in the tester's browser;
- **Copy report**: the run as a Markdown summary (who, where, counts, every failure with its note) ready for a ticket or a chat;
- progress by result per section and overall, filters (To do, Fail, Blocked), a section list that follows you, light and dark theme;
- a coloured label on every step saying where it happens (Server, Admin panel, Mobile app…);
- code blocks with a Copy button;
- nothing to install, no server, no tracking — one file you can attach, commit or host.

Two ways to build, same result: a **browser tool** (no install at all) and a **command line** (Node 18+, no packages).

---

## Contents

- [Quick start](#quick-start)
- [How it fits together](#how-it-fits-together)
- [Writing a checklist source](#writing-a-checklist-source)
- [Step labels ("where")](#step-labels-where)
- [Project settings: checklists.config.json](#project-settings-checklistsconfigjson)
- [The command line](#the-command-line)
- [The browser tool](#the-browser-tool)
- [Moving an existing checklist page over](#moving-an-existing-checklist-page-over)
- [Writing good checks](#writing-good-checks)
- [What testers get](#what-testers-get)
- [Hosting the browser tool](#hosting-the-browser-tool)
- [Developing the generator](#developing-the-generator)
- [FAQ](#faq)

---

## Quick start

### In the browser (anyone, nothing to install)

1. Open **`generator.html`** — from a clone of this repo, or the hosted copy if your team has one ([Hosting](#hosting-the-browser-tool)).
2. Press **New** and edit the JSON on the left. The preview on the right updates as you type; problems are listed under the editor.
3. Type a file name, date first: `2026-11-12-password-reset-manual-tests`.
4. **Download source** (keep it — it is what you edit next time) and **Download page** (what testers open).

### On the command line (Node 18 or newer)

From the root of the project the checklists belong to:

```bash
npx checklist-generator init     # creates checklists.config.json and a first source
npx checklist-generator build    # builds every source into a page
```

`init` creates:

```
checklists.config.json
checklists/
  AGENTS.md                                ← how to write checklists here, for AI agents and people
  sources/
    2026-11-12-example-manual-tests.json   ← edit this
```

and `build` writes `checklists/2026-11-12-example-manual-tests.html`.

### With an AI coding agent

`init` writes `AGENTS.md` into the pages folder. It is a short guide, written for this project, that lets an agent (Claude Code, Codex, Cursor…) add or change a checklist without help. It covers:

- which files to edit and which never to touch (the generated `.html` pages);
- the exact `check` / `build` commands for this project;
- the source format and the rules that are easy to break: both languages, no numbers, stable `key`s;
- a short "Writing good checks".

If the project already has an `AGENTS.md` or `CLAUDE.md` at its root, `init` adds a short section there pointing to the guide. Agents start at the root, so this is how they find it. If you add one of those files later, run `init` again: it adds the pointer and changes nothing else. `init` never overwrites a guide that is already there, so edit it freely. If the pages go to the project root, the guide is named `CHECKLISTS.md` instead.

After that, asking an agent to "write the manual-test checklist for the refund feature" is enough. It writes the source, runs `check` until it passes, and builds the page.

If the folder has a `package.json`, `init` also adds the generator as a dev dependency and a script to run it, so the whole team uses the same version:

```json
"scripts": {
  "checklists": "checklists"
},
"devDependencies": {
  "checklist-generator": "^1.0.0"
}
```

Run `npm install` once. After that every command runs through npm:

```bash
npm run checklists build
npm run checklists new 2026-11-12-login-manual-tests
npm run checklists -- check --config other.json   # options need the "--"
```

`init` never changes a `checklists` script or a `checklist-generator` dependency that is already there. The one exception is the old `npx --yes github:…` script, which it replaces.

### Updating

New versions are published to npm; what changed is in the [releases](https://github.com/MahmoudElshiha/checklist-generator/releases).

```bash
npm update checklist-generator                     # newest 1.x, the range in package.json
npm install --save-dev checklist-generator@latest  # also moves to a new major version
npm run checklists version                         # what you have now
```

Commit `package.json` and `package-lock.json` so everyone gets the same version. If you run it with `npx checklist-generator` instead, `npx checklist-generator@latest` makes sure you get the newest version.

Pages you already built never change on their own. Run `npm run checklists build` after updating to give them the new version's features. Testers keep their results (ticks from a version 1 page become Pass).

---

## How it fits together

| Thing | What it is | Who edits it |
|---|---|---|
| **Source** — `sources/<name>.json` | The checklist's content: sections, checks, steps, expectations, in English and Arabic | You, in any editor or in the browser tool |
| **Page** — `<name>.html` | The checklist testers open. Generated — never edit it by hand | Nobody: rebuild it |
| **Project settings** — `checklists.config.json` | Optional. Your project's folders, its own step labels and its defaults | Once per project |
| **Engine** — `checklist-engine.js` | Validates a source and renders the page. Used by both the browser tool and the CLI | This repo |

The source and the page have the same name. Commit both: the source so the checklist can be changed, the page so testers can open it without building anything.

---

## Writing a checklist source

A complete, small source:

```json
{
  "$schema": "https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/checklist.schema.json",
  "title":   { "en": "Password Reset Checks", "ar": "فحوصات استعادة كلمة المرور" },
  "heading": { "en": "Password reset — manual checks", "ar": "استعادة كلمة المرور — الفحوصات اليدوية" },
  "intro":   {
    "en": "<p>Customers can reset a forgotten password with a code sent by email.</p>",
    "ar": "<p>يمكن للعميل إعادة تعيين كلمة المرور برمز يُرسل بالبريد.</p>"
  },
  "sections": [
    {
      "title": { "en": "Setup", "ar": "التجهيز" },
      "items": [
        {
          "key": "setup-deploy",
          "title": { "en": "The test server runs the latest build", "ar": "خادم الاختبار يعمل بآخر نسخة" },
          "steps": [
            { "where": "server", "en": "Deploy the release branch and run the migrations.", "ar": "انشر فرع الإصدار وشغّل الترحيلات." }
          ],
          "code": ["npm run migrate"],
          "expect": [
            { "en": "Every command finishes without errors.", "ar": "تنتهي كل الأوامر دون أخطاء." }
          ]
        }
      ]
    }
  ]
}
```

A full example with three sections, SQL, curl and a custom step label is in [`examples/`](examples/) — open [the built page](examples/2026-01-15-password-reset-manual-tests.html) to see the result.

The `$schema` line gives you autocomplete, hover help and red underlines in VS Code, JetBrains IDEs and most editors. Keep it.

### Text rules

- **Every text is a pair** `{ "en": "…", "ar": "…" }`, and both are required. A source missing one is refused, with every gap listed — a half-translated page never ships.
- **Texts may contain HTML**: `<code>`, `<strong>`, `<em>`, `<a>`, and `<p>` in the intro. They are inserted as written, so write them the way you want them shown.
- **`code` is plain text**, shown in a box with a Copy button. Write commands, queries and payloads there, not in the step text.
- **Never type numbers.** Sections are numbered from 0 and checks `<section>.<n>` (0.1, 0.2, 1.1…) when the page is built, so adding or moving a check never means renumbering.

### Page fields

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | The browser tab title. Short: "Equipment Checks" |
| `heading` | yes | The heading in the page's top bar |
| `intro` | yes | What is being tested and why, as HTML paragraphs. Name the change, the ticket or decision behind it, and the test data the figures assume |
| `sections` | yes | The sections, in order. Section 0 is usually **Setup** |
| `how_to` | no | `{ "en": [lines], "ar": [lines] }` — replaces the standard "How to use this page" lines. The step-label legend is always added after them |
| `fail_note` | no | Replaces the standard "When a check fails" note |
| `places` | no | Step labels used only by this checklist ([Step labels](#step-labels-where)) |
| `storage_key` | no | Where the browser saves results. Leave it out and it is `<storage_prefix><file name>-v1`. Set it only to keep results when you rename a file |

### Section fields

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Without its number: "Setup", not "0. Setup" |
| `items` | yes | The checks, in order |
| `id` | no | The section's anchor (`page.html#s2-refunds`). Derived from the English title when left out |

### Check fields

| Field | Required | Meaning |
|---|---|---|
| `key` | yes | Unique within the checklist, lowercase with dashes: `email-reset`. The browser saves the result under it — **keep it when you reword the check**, or testers lose that result |
| `title` | yes | What the check proves, as a sentence: "The code sets a new password, once" |
| `steps` | yes | What to do, in order. Each step: `{ "where": "<label>", "en": "…", "ar": "…" }` |
| `code` | no | A string, or a list of strings: commands, SQL, JSON, shown with a Copy button |
| `expect` | yes | "You should see": a list of `{ "en", "ar" }` lines. The tester chooses Pass only when **every** line is true |

---

## Step labels ("where")

Every step starts with a coloured label saying where it happens. `where` names one:

| `where` | English | Arabic |
|---|---|---|
| `server` | Server | الخادم |
| `database` | Database | قاعدة البيانات |
| `admin` | Admin panel | لوحة الإدارة |
| `website` | Website | الموقع |
| `mobile_app` | Mobile app | تطبيق الجوال |
| `api` | API client | عميل API |
| `mailbox` | Mailbox | البريد |
| `partner` | Partner system | نظام الشريك |

Add your own — or relabel a built-in one — with `"places": { "key": ["English", "Arabic"] }`:

- in **`checklists.config.json`**, for every checklist of the project (e.g. `"vendor": ["Vendor panel", "لوحة المطعم"]`);
- in **a source**, for that checklist only.

A source's labels win over the project's, which win over the built-in ones. The page's "How to use" box lists only the labels that checklist actually uses.

---

## Project settings: checklists.config.json

Optional, at the root of your project. Every field is optional.

```json
{
  "$schema": "https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/checklists.config.schema.json",
  "sources": "docs/checklists/sources",
  "output": "docs/checklists",
  "storage_prefix": "myapp-",
  "places": {
    "vendor": ["Vendor panel", "لوحة المطعم"],
    "pos": ["Shop till", "نقطة البيع"]
  }
}
```

| Field | Default | Meaning |
|---|---|---|
| `sources` | `checklists/sources` | Folder of the JSON sources, relative to the config file |
| `output` | `checklists` | Folder the pages are written to, relative to the config file |
| `storage_prefix` | `checklist-` | Start of every page's storage key, so two projects' checklists opened in the same browser never share results. Use your project's name |
| `places` | — | Step labels for every checklist of the project |
| `how_to` | standard lines | Replaces the "How to use this page" lines for every checklist (a source's own still wins) |
| `fail_note` | standard note | Replaces the "When a check fails" note for every checklist (a source's own still wins) |

In the browser tool, load this file with **Project settings** so the preview uses the same labels and defaults.

---

## The command line

```
checklists init                 create checklists.config.json and a first source here,
                                add a "checklists" script and a devDependency to
                                package.json, and an AGENTS.md guide for AI agents
checklists new <name>           create a new source from the starter
checklists build [name...]      build every source (or the ones named) into pages
checklists check [name...]      validate only, write nothing
checklists help

--config <file>                 use this config instead of ./checklists.config.json
```

Run it with `npm run checklists <command>` once `init` has added it to the project, with `npx checklist-generator <command>`, or from a clone with `node bin/checklists.js <command>`. To type plain `checklists <command>` anywhere, install it globally: `npm i -g checklist-generator`. `checklists version` prints the version you have.

- It reads the config from the current folder (or `--config`); without one it uses `./checklists/sources` → `./checklists`.
- `build` refuses a source with problems, prints every one of them, writes nothing for that source, and exits with code 1 — so `checklists check` works as a pre-commit hook or a CI step.
- Name sources date first (`2026-11-12-feature-manual-tests`): they then sort in the order they were written.

Output looks like:

```
✓ 2026-11-12-equipment-manual-tests.html — 8 sections, 42 checks
✗ 2026-11-14-refunds-manual-tests:
  - check 2.3: missing "ar".
  - check 3.1 step 2: unknown place "kiosk" (known: server, database, …; add yours under "places").
```

---

## The browser tool

`generator.html` does everything the CLI does, one checklist at a time, with a live preview. It needs `checklist-engine.js` next to it.

| Button | What it does |
|---|---|
| **New** | Starts from a small starter checklist |
| **Open source (.json)** | Loads a source to edit |
| **Import page (.html)** | Turns an existing checklist page back into a source ([below](#moving-an-existing-checklist-page-over)) |
| **Project settings** | Loads your project's `checklists.config.json` (labels, defaults, storage prefix). Remembered until you press **Clear** |
| **Format** | Re-indents the JSON |
| **Download source** | Saves the JSON — put it in your sources folder |
| **Download page** | Saves the finished HTML — put it in your pages folder. Disabled while there are problems |

Your draft and project settings are kept in the browser (local storage), so closing the tab loses nothing. Nothing is uploaded anywhere.

---

## Moving an existing checklist page over

Already have checklist pages made by hand in this layout (or built by an older copy of this tool)? In the browser tool, load your **Project settings** first, then **Import page (.html)**:

- every section, check, step, code block and expectation comes back as a source;
- the page's storage key is kept, so testers keep their results;
- a step label the tool does not know becomes an entry under `places` in the source — move it to your project settings if other checklists use it too;
- the "How to use" lines and the "When a check fails" note are kept as the source's own `how_to` and `fail_note`. Delete them from the source if the standard ones (or your project's) will do.

Then **Download source** and rebuild. A page that is English-only cannot be imported until its Arabic is written — the tool refuses half-translated checklists.

---

## Writing good checks

The tool makes the page; the value is in what you write. What has worked:

- **Section 0 is Setup**: build and deploy on the test server (with the exact commands, including migrations), the test data, the accounts. Everything after it assumes it.
- **Fix the test data and work out the figures.** "One kabsa with the plate on deposit: total 135.00, to pay 185.00" beats "check the total is right". Say in the intro what the figures assume (tax off, delivery 10.00…).
- **One check proves one thing**, and its title says what: "A coupon never discounts the plate".
- **Every expectation can be seen**: a sentence on screen, a figure, a row in a table, a field in a response. Not "it works".
- **Put commands, SQL and payloads in `code`**, with placeholders in braces (`{tenant-slug}`), so the tester copies instead of retyping.
- **Cover the refusals**, not only the happy path: the wrong input, the limit, the expired code — with the exact message.
- **When a partner has its own test cases**, name them on the checks that cover them ("(partner case K2)") so both sides can cross-reference.
- **Keep `key`s stable.** Reword freely; change a key only when the check really becomes a different check.

---

## What testers get

Every generated page has, with nothing to set up:

- **A result per check**: Pass, Fail, Blocked (could not run it) or Not applicable — each with an icon and a word, never colour alone. Choosing Fail or Blocked opens a note: *what did you see?* Passed checks fold to one line; click to open them again.
- **The run**: *Tested by* and *Server and build* fields at the top.
- **Copy report**: a Markdown summary of the run — who, where, when, the counts, every Fail, Blocked and Not applicable check with its note, and the checks not run yet. **Print** gives the same as a paper report.
- **Progress by result**: one bar split into pass, fail, blocked and not applicable, overall and per section, with the counts beside it.
- **Finding your way**: on a wide screen a section list stays beside the checks, with each section's progress and a "1 Fail" flag, and follows as you scroll. **Next to do** jumps to the first check without a result. Filters show only To do, Fail or Blocked. **Copy link** on a check gives a link that opens that check.
- **English / Arabic** button at the top (the Arabic view is right-to-left). Open `page.html?lang=ar` to start in Arabic.
- **Theme** for light or dark, **Clear results** to start over, **Copy** buttons on code blocks.
- Keyboard and screen-reader friendly: visible focus, a skip link, results announced in words ("Check 1.2: Fail. 5 of 7 done.").

Results, notes and the run fields are saved in that browser, under the page's storage key, and shared between both languages. A page built by version 1 saved ticks under the same key: they show as **Pass** in the new page.

It is one HTML file with no external requests: attach it to a ticket, commit it, or host it anywhere.

---

## Hosting the browser tool

`generator.html` and `checklist-engine.js` are static files, so any static host works. On GitHub Pages:

1. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
2. Share `https://<owner>.github.io/checklist-generator/` (the root `index.html` opens the generator).

The hosted tool runs entirely in each person's browser — sources are never uploaded.

---

## Developing the generator

```
checklist-engine.js            validation, rendering, import — the whole generator (browser + Node)
generator.html                 the browser tool
index.html                     redirects to generator.html (for hosting)
bin/checklists.js              the command line
checklist.schema.json          a source's format
checklists.config.schema.json  a project's settings
examples/                      a complete example project, built
test/                          node:test tests for the engine and the CLI
```

```bash
npm test                 # node --test, no packages needed
npm run example          # rebuild examples/ after changing the engine
```

Things to keep:

- **No dependencies.** The engine must load as a plain `<script>` in a browser and through `require()` in Node.
- **The generated page stays one self-contained file**: no external CSS, fonts or scripts.
- **A storage key never changes for an existing page** unless its author asks — testers' results live under it.
- Change the source format and you change `checklist.schema.json`, the README tables and a test in the same commit.

---

## FAQ

**Can I have only English, or another language?**
Not today: every checklist is English and Arabic, and both are required. The page's toggle, labels and right-to-left layout are built for that pair.

**Can a tester's results be shared with someone else?**
Results live in that browser only. To share them, the tester presses **Copy report** and pastes it into the ticket or chat — every failure comes with its note.

**I renamed a source and testers lost their results.**
The storage key comes from the file name. Put the old key in the source as `"storage_key"` and rebuild.

**Why is my HTML in a text shown as-is?**
Texts are inserted as HTML on purpose. If you need a literal `<`, write `&lt;`. In `code` blocks everything is shown as plain text, so no escaping is needed there.

**Does the browser tool send my checklist anywhere?**
No. It is a static page; building, previewing and downloading all happen in your browser.

---

## Licence

[MIT](LICENSE) © 2026 Mahmoud Elshiha
