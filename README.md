# checklist-generator

Turn a short JSON file into a **bilingual (English / Arabic) manual-test checklist**: one self-contained HTML page a tester opens in any browser.

**Built to be written by AI.** Describe the feature and your AI coding agent writes the checklist, in both languages, checks it and builds the page. [See how](#let-ai-write-your-checklists).

What testers get:

- English ⇄ Arabic toggle (Arabic is right-to-left)
- a result per check (**Pass, Fail, Blocked, Not applicable**) plus a note, saved in their browser
- **Copy report**: a Markdown summary with every failure and its note, ready to paste into a ticket
- progress bars, filters, a section list, light and dark theme, Copy buttons on code
- no server, no tracking, no external requests: attach the file, commit it or host it

[See an example page](examples/2026-01-15-password-reset-manual-tests.html)

---

## Quick start

Requires Node 18+. Run these from the root of your project:

```bash
npm install --save-dev checklist-generator
npx checklists init            # creates the config and a first checklist
npm run checklists build       # builds the HTML pages
```

You now have:

```
checklists.config.json                       project settings (optional)
checklists/
  AGENTS.md                                  guide for AI agents (and people)
  sources/2026-11-12-example-manual-tests.json   ← edit this
  2026-11-12-example-manual-tests.html          ← open this (generated)
```

Edit the JSON, run `build` again, and commit **both** files: the source so the checklist can be changed, the page so testers can open it.

> No `package.json`? Run `npx checklist-generator init` and `npx checklist-generator build` instead.
> Not using Node at all? Use the [browser tool](#browser-tool-no-install).

---

## Let AI write your checklists

This is the fastest way to use the tool. The AI writes the JSON, and the tool makes sure it's complete before building the page. A checklist with a missing translation, a missing expectation or an unknown step label is refused, with every problem listed, so the agent fixes it before anything ships.

### With a coding agent (Claude Code, Codex, Cursor, Copilot…)

`init` sets this up for you. It writes `checklists/AGENTS.md`, a guide for this project covering which files to edit, the exact commands, the source format and what makes a good check. If your project has an `AGENTS.md` or `CLAUDE.md` at its root, `init` adds a pointer to the guide, so the agent finds it on its own. Create one of those later? Run `init` again to add the pointer.

Then just ask:

```text
Write the manual-test checklist for the password reset feature.
```

```text
Read the changes on this branch and write a manual-test checklist that covers them,
including the error cases. Use the test accounts from the seed data.
```

```text
Add checks to 2026-11-12-refunds-manual-tests for partial refunds and the new 30-day limit.
```

The agent writes the source, runs `check` until it passes, and builds the page. Because it can read your code, it can name the real screens, messages, endpoints and figures.

**Tip:** give it what a tester needs and the code doesn't show: the ticket, the test server, the test accounts, a partner's test cases.

### With a chat assistant (Claude, ChatGPT…)

No repo access needed. Paste this, then describe the feature below it:

```text
Write a manual-test checklist as JSON for checklist-generator.
Follow this JSON Schema exactly:
https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/checklist.schema.json

Rules:
- Every text is { "en": "...", "ar": "..." }; write real Arabic, both are required.
- No numbers in section or check titles; the page numbers them.
- Section 0 is "Setup": deploy, test data, accounts.
- One check proves one thing. Every "expect" line is something visible on screen
  or in a response, with exact figures and messages. Cover error cases too.
- Step "where" is one of: server, database, admin, website, mobile_app, api, mailbox, partner.
- Commands, SQL and payloads go in "code", not in the step text.

The feature:
<describe it, or paste the ticket>
```

Paste the reply into the [browser tool](#browser-tool-no-install) to preview it and see any problems. Then **Download page**, or save the JSON to `checklists/sources/` and run `build`.

---

## Everyday commands

```bash
npm run checklists new 2026-11-12-login-manual-tests   # new checklist from the starter
npm run checklists check                               # validate only, write nothing
npm run checklists build                               # validate and build every page
npm run checklists build 2026-11-12-login-manual-tests # build just one
```

If a source has problems, `check` and `build` list all of them and exit with code 1, so `check` also works as a pre-commit hook or CI step:

```
✓ 2026-11-12-equipment-manual-tests.html — 8 sections, 42 checks
✗ 2026-11-14-refunds-manual-tests:
  - check 2.3: missing "ar".
  - check 3.1 step 2: unknown place "kiosk" (known: server, database, …; add yours under "places").
```

Name sources date first (`2026-11-12-feature-manual-tests`) so they sort in the order they were written.

---

## Writing a checklist

The format, if you write or review checklists by hand. Your AI agent gets the same rules from `AGENTS.md`.

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

Keep the `$schema` line: it gives you autocomplete and error underlines in VS Code, JetBrains IDEs and most other editors. A bigger example is in [`examples/`](examples/).

### Rules

- **Every text needs both `en` and `ar`.** If one is missing, the source is refused.
- **Don't type numbers.** Sections (0, 1, 2…) and checks (0.1, 0.2, 1.1…) are numbered when the page is built.
- **Never change a check's `key`** when you reword it. Testers' results are saved under it.
- **Texts can contain HTML** (`<code>`, `<strong>`, `<em>`, `<a>`, and `<p>` in `intro`). Write a literal `<` as `&lt;`.
- **Put commands, SQL and payloads in `code`**, not in the step text. They are shown as plain text with a Copy button.

### Fields

**Page**

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Browser tab title |
| `heading` | yes | Heading in the top bar |
| `intro` | yes | What is tested and why, as HTML paragraphs. Name the ticket and the test data the figures assume |
| `sections` | yes | The sections, in order. Section 0 is usually **Setup** |
| `how_to` | no | `{ "en": [lines], "ar": [lines] }`: replaces the standard "How to use this page" lines |
| `fail_note` | no | Replaces the standard "When a check fails" note |
| `places` | no | Step labels for this checklist only ([Step labels](#step-labels)) |
| `storage_key` | no | Where results are saved. Defaults to `<storage_prefix><file name>-v1`. Set it only to keep results after renaming the file |

**Section**

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Without a number: "Setup", not "0. Setup" |
| `items` | yes | The checks, in order |
| `id` | no | Anchor (`page.html#s2-refunds`). Derived from the English title if left out |

**Check**

| Field | Required | Meaning |
|---|---|---|
| `key` | yes | Unique, lowercase with dashes: `email-reset`. Keep it stable |
| `title` | yes | What the check proves: "The code sets a new password, once" |
| `steps` | yes | What to do, in order: `{ "where": "<label>", "en": "…", "ar": "…" }` |
| `code` | no | A string or list of strings, shown with a Copy button |
| `expect` | yes | What the tester should see: a list of `{ "en", "ar" }`. Pass means **every** line is true |

### Writing good checks

- **Section 0 is Setup**: deploy, migrations (exact commands), test data, accounts.
- **Use fixed test data with worked-out figures.** "Total 135.00, to pay 185.00" beats "the total is right".
- **One check proves one thing**, and its title says what.
- **Every expectation can be seen** (a message, a figure, a row, a response field). Never "it works".
- **Cover the refusals** (wrong input, limits, expired codes) with the exact message.

---

## Step labels

Every step starts with a coloured label saying where it happens. Set it with `where`:

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

Add your own, or rename a built-in one, with `"places": { "vendor": ["Vendor panel", "لوحة المطعم"] }`. Put it in `checklists.config.json` for the whole project, or in a source for that checklist only. If both define the same label, the source wins.

---

## Project settings

`checklists.config.json` at your project root. Every field is optional.

```json
{
  "$schema": "https://raw.githubusercontent.com/MahmoudElshiha/checklist-generator/main/checklists.config.schema.json",
  "sources": "docs/checklists/sources",
  "output": "docs/checklists",
  "storage_prefix": "myapp-",
  "places": { "vendor": ["Vendor panel", "لوحة المطعم"] }
}
```

| Field | Default | Meaning |
|---|---|---|
| `sources` | `checklists/sources` | Folder of the JSON sources (relative to this file) |
| `output` | `checklists` | Folder the pages are written to (relative to this file) |
| `storage_prefix` | `checklist-` | Start of every page's storage key. Use your project's name so two projects never share results |
| `style` | — | A CSS file (relative to this file) added to every page. See [Your own look](#your-own-look) |
| `places` | — | Step labels for every checklist |
| `how_to` | standard | "How to use this page" lines for every checklist (a source's own wins) |
| `fail_note` | standard | "When a check fails" note for every checklist (a source's own wins) |

### Customizing your pages

- **For the whole project:** set `places`, `how_to` and `fail_note` in `checklists.config.json`.
- **For one checklist:** put `places`, `how_to` or `fail_note` in its source. They win over the config.
- **The content is all yours:** title, heading, intro, sections and checks.
- **The look:** point `style` at your own CSS file. See below.

The starter that `checklists new` creates can't be changed yet. Need it? [Open an issue](https://github.com/MahmoudElshiha/checklist-generator/issues).

### Your own look

Add `"style": "checklists/style.css"` to `checklists.config.json` and run `build`. The CSS is copied into every page after the built-in styles, so your rules win and each page is still one file.

The page uses colour variables, so most themes only need these:

```css
:root {
  --primary: #6d28d9;        /* buttons, links, progress */
  --primary-soft: #ede9fe;
  --bg: #faf9ff;             /* page background */
  --surface: #ffffff;        /* cards */
}
:root[data-theme="dark"] {   /* dark theme picked with the button */
  --primary: #a78bfa;
  --primary-soft: #2e1065;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --primary: #a78bfa; --primary-soft: #2e1065; }
}
body { font-family: "Inter", system-ui, sans-serif; }
```

Other variables: `--ink`, `--muted`, `--line`, `--surface-2`, `--code`, `--radius`, and the result colours `--pass`, `--fail`, `--blocked`, `--na` (each with a `-soft` partner). To restyle anything else, open a built page in your browser's dev tools to see its classes. Class names can change in a new major version.

Change the CSS, then run `build` again. The browser tool ignores `style`.

---

## Command reference

```
checklists init              create the config, a first source and AGENTS.md;
                             add a "checklists" script (and devDependency) to package.json
checklists new <name>        create a new source from the starter
checklists build [name...]   build every source, or the ones named
checklists check [name...]   validate only, write nothing
checklists version           print the installed version
checklists help

--config <file>              use this config instead of ./checklists.config.json
```

Through npm, options need `--`: `npm run checklists -- check --config other.json`.

`init` never overwrites anything you already have: config, sources, guide, script or dependency. Running it again is safe. The only exception is the old `npx --yes github:…` script, which it replaces.

---

## Updating

```bash
npm update checklist-generator                     # latest 1.x
npm install --save-dev checklist-generator@latest  # latest, including a new major version
```

Then run `npm run checklists build` to rebuild your pages with the new version. Testers keep their saved results. Commit `package-lock.json` so the whole team uses the same version. See [releases](https://github.com/MahmoudElshiha/checklist-generator/releases) for what changed.

`build` tells you when a newer version is out. It asks the npm registry while it builds, waits at most 1.5 seconds and stays silent when you're offline. It never runs in CI. To turn it off, set `NO_UPDATE_NOTIFIER=1` or `CHECKLISTS_NO_UPDATE_CHECK=1`.

---

## Browser tool (no install)

Open `generator.html` from a clone of this repo, or your team's hosted copy. It needs `checklist-engine.js` in the same folder.

1. **New** (or **Open source**) and edit the JSON. The preview updates as you type, and problems are listed below the editor.
2. Type a file name, date first: `2026-11-12-password-reset-manual-tests`.
3. **Download source** (keep it, it's what you edit next time) and **Download page** (what testers open).

**Project settings** loads your `checklists.config.json` so the preview uses your labels. Your draft is kept in the browser and nothing is uploaded.

**Import page (.html)** turns an existing checklist page (handmade in this layout, or built by an older version) back into a source. Its storage key is kept, so testers keep their results. Load your project settings first.

**Hosting:** it's static files. On GitHub Pages: Settings → Pages → Deploy from branch `main` / root, then share `https://<owner>.github.io/checklist-generator/`.

---

## FAQ

**Only English, or another language?** Not yet. Both English and Arabic are required.

**How do testers share results?** Results stay in their browser. They press **Copy report** and paste it into the ticket or chat.

**I renamed a source and testers lost their results.** Put the old key in the source as `"storage_key"` and rebuild.

---

## Contributing

```bash
npm test             # node --test, no packages needed
npm run example      # rebuild examples/ after changing the engine
```

| File | What it is |
|---|---|
| `checklist-engine.js` | Validation, rendering, import (browser and Node) |
| `bin/checklists.js` | The command line |
| `generator.html` | The browser tool (`index.html` redirects to it) |
| `checklist.schema.json`, `checklists.config.schema.json` | Source and config formats |

Keep: **no dependencies**; the generated page stays **one self-contained file**; a page's **storage key never changes** unless its author asks. If you change the source format, update the schema, this README and a test in the same commit.

---

[MIT](LICENSE) © 2026 Mahmoud Elshiha
