# CVP Requisition

A native desktop application for the *Requisition for Issue of Casual Visitor
Pass (CVP)*. It runs **entirely offline** — the app makes no network requests
of any kind — and ships for **Windows, Linux and macOS**.

| | |
|---|---|
| **Platforms** | Windows · Linux · macOS (Intel and ARM) |
| **Database** | a local file by default; MySQL when you want one shared copy |
| **Network** | none — no fetch, no sockets, no remote assets, no telemetry |
| **Configuration** | one `.env` file; nothing is configured in code |

---

## Installing and running it

### For normal use — install it like any other app

Build the installers (see below), then on each machine:

| | What you get | How you start it afterwards |
|---|---|---|
| **Windows** | run `CVP Requisition-1.0.0-win-x64.exe` | Desktop shortcut and Start-menu entry |
| **macOS** | open the `.dmg`, drag the app to Applications | Launchpad, Spotlight, or the Applications folder |
| **Linux (deb)** | `sudo apt install ./CVP\ Requisition-1.0.0-linux-amd64.deb` | your applications menu, under Office |
| **Linux (AppImage)** | `chmod +x *.AppImage` then double-click | the file itself — nothing to install |

The app has its own icon — a visitor pass on a navy ground — so it is
recognisable in the dock, taskbar, Start menu and application list.

Nothing else needs installing. The app creates its data file on first launch
and asks you to create the administrator account.

**The builds are not code-signed**, so each OS warns once the first time:

* **Windows** — SmartScreen says "Windows protected your PC": click
  *More info* → *Run anyway*.
* **macOS** — "cannot be opened because the developer cannot be verified":
  right-click the app → *Open* → *Open*. Only needed once. (Or run
  `xattr -dr com.apple.quarantine "/Applications/CVP Requisition.app"`.)
* **Linux** — no warning.

Buying a signing certificate for each platform removes these prompts; nothing
in the app needs to change.

### For development

Double-click `run-app-windows.bat` (Windows) or `run-app-mac.command` (macOS), or:

```bash
npm install
npm start
```

Full step-by-step setup, data location and MySQL guide: [`SETUP.md`](SETUP.md).

To see it with sample data in it: `npm run seed-demo`.

### Building installers

```bash
npm run build:win     # NSIS installer (x64 + 32-bit) and a portable .exe
npm run build:linux   # AppImage and .deb, x64 + arm64
npm run build:mac     # .dmg and .zip, Intel + Apple Silicon
```

Artifacts land in `dist/`. `.env` ships beside the app rather than inside it,
so a deployment can be reconfigured without rebuilding.

Notes: building Windows installers from macOS or Linux needs Wine. `.rpm` is
not built by default because it needs `rpmbuild` installed (`brew install rpm`
on macOS); add `{"target": "rpm", "arch": ["x64"]}` to `build.linux.target` in
`package.json` if you want it.

---

## Offline, and how you can tell

* No `fetch`, `XMLHttpRequest`, `WebSocket` or `http` module anywhere in
  `electron/` or `renderer/`.
* No remote stylesheets, fonts, scripts or images — the page loads only its own
  two local files.
* A content-security policy of `default-src 'none'` blocks remote content even
  if something tried.
* Navigation away from the page and `window.open` are both refused.
* Two runtime dependencies: `dotenv` and `mysql2` (the latter only used when
  you switch the engine to MySQL).

---

## The database

```
DB_ENGINE=sqlite   # default — one local file, no server, nothing to install
DB_ENGINE=mysql    # a shared server, for several desktops on one database
```

**`sqlite`** stores everything in a single file using the SQLite engine built
into Electron — no native module, no service, no administrator. The file lives
in the OS application-data folder unless `DB_FILE` says otherwise:

| | |
|---|---|
| Windows | `%APPDATA%\CVP Requisition\doform.db` |
| macOS | `~/Library/Application Support/CVP Requisition/doform.db` |
| Linux | `~/.config/CVP Requisition/doform.db` |

**`mysql`** points the same application at a MySQL server. Set the `MYSQL_*`
lines in `.env`, then create the database once:

```bash
MYSQL_ROOT_USER=root MYSQL_ROOT_PASSWORD=yourRootPassword npm run init-db
```

Point several desktops at one office PC by setting `MYSQL_HOST`. Still no
internet — just the local network.

Both engines run the same queries and are covered by the same tests.

**Upgrading an existing installation.** New columns are added to an existing
database in place, the first time the new version opens it. Nothing is dropped
or rewritten, the step is safe to repeat, and there is a test that builds a
database in the previous format, fills it with records and accounts, upgrades
it and checks every row survived.

---

## Everything is configured in `.env`

`.env` is the single source of truth, and the Settings screen shows the values
the running app actually loaded.

| Group | Controls |
|---|---|
| Identity | app name, unit name, form title, footer note, unit motto |
| Form limits | `MAX_VISITORS`, `MAX_VEHICLES`, `MAX_ESCORTS` |
| Database | `DB_ENGINE`, `DB_FILE`, and the `MYSQL_*` settings |
| Authentication | scrypt cost, password policy, session length, lockout, self sign-up, default role |
| Accounts | managed in the app, not in `.env` |
| Window | size, minimum size, start maximised |
| Appearance | primary and accent colour, date format |
| Dashboard | bar colour, the five status colours, days shown |
| Records | `RECORDS_PAGE_SIZE` |
| Export | CSV delimiter |

Restart the app after editing. `.env` can hold a MySQL password, so it is
git-ignored.

---

## What the app does

**Sign in.** The first launch on a machine has no accounts, so it asks you to
create the administrator; that first account is always an administrator. After
that the screen is a normal sign-in, with a sign-up link when
`ALLOW_SELF_SIGNUP=true` (new accounts get `DEFAULT_ROLE`).

There is a dedicated **Accounts** section in the sidebar. Everyone can change
their own name, rank and password there. Administrators additionally get the
full directory: create accounts, reset a forgotten password, edit details,
promote or demote, and remove an account.

Accounts live in the same database as the records, so signing in never needs a
network. Passwords are stored as scrypt hashes with a per-user random salt —
never in plain text. A wrong username and a wrong password give the identical
message and cost the same work, so neither can be probed by timing. Five wrong
attempts lock that username for five minutes (`AUTH_MAX_LOGIN_ATTEMPTS`,
`AUTH_LOCKOUT_MINUTES`). The session lives in the main process, not the page:
it expires after `AUTH_SESSION_HOURS` and closing the app signs you out.

Because accounts sit in the database, `DB_ENGINE=sqlite` gives each machine its
own accounts, while `DB_ENGINE=mysql` shares one set across every desktop.

**If someone forgets their password**, any administrator resets it from
Accounts → *Reset password*. That also lifts any lockout. If the only
administrator is locked out, run on the machine holding the data:

```bash
npm run reset-password -- --list
npm run reset-password -- <username> "<new password>"
```

**Records are never tied to an account.** Requisitions belong to the unit:
every signed-in user sees all of them, and removing an account does not delete
a single record — there is no foreign key between the two, and tests on both
engines prove it.

What *is* tied to a person is their **service number**. Each requisition stores
the service number of whoever wrote it, so giving a new account the same
service number reconnects that person's earlier requisitions to it
automatically — the app says how many as it happens. A forgotten password, a
deleted account, or a posting out and back therefore never costs anyone their
history. Two live accounts may not share a service number.

**The form.** Every section of the paper CVP, with inline add/remove for
visitors, vehicles and escorts, capped at the configured maximums. The *For use
of Security Office* block is administrators only.

**Validation happens as you fill the form**, not only when you press Save. A
field is checked when you leave it and the message clears the moment the value
becomes valid — nothing is flagged before you have had a chance to fill it in.
Fields that depend on each other re-check together: changing the start time
re-checks the end time, and naming a visitor makes their ID proof number
required. Pressing Save reveals anything still outstanding, scrolls to the
first problem and puts the cursor in it, and the summary list shrinks as you
work through it.

**Records.** Search across visitor names, ID proof numbers, departments, pass
numbers, file numbers and purpose; filter by status and visit-date range; Reset
clears everything. Searching is debounced and the box keeps focus while results
refresh, so typing is never interrupted. Results are paginated —
first/previous/next/last, a live `41–60 of 317` range, and a rows-per-page
selector.

**Leaving a form.** Every form has a **← Back** button at the top, and the
requisition form also answers Escape. If you have unsaved changes it asks
before discarding them; an untouched form just closes. Saving returns you to
the list on its own and never asks.

**Expanding a row.** Click any row to open it in place and read the whole
requisition without leaving the list: visit details, every visitor, vehicle and
escort, and the Security Office block. From that panel you can change the
status (administrators), open the full editor, print the single form, or save
it as a PDF. Double-clicking a row goes straight to the editor. Ticking a row
selects it without opening it.

**Printing and downloading.** Actions apply to the rows you tick, or — when
nothing is ticked — to **every record matching the current filters**, not just
the page on screen. The action bar always says which.

| Action | Result |
|---|---|
| Print forms | the official form, one A4 page per requisition, via the OS print dialog |
| Print list | a tabular summary of the whole selection |
| Save as PDF | the same output written to a file you choose |
| Download CSV | one row per visitor, UTF-8 with a BOM so Excel opens it correctly |

Administrators can also set the status of a selection, or delete it.

**Dashboard.** Counts of requisitions, visitors, vehicles and items awaiting
action; volume per day across a real calendar window; a breakdown by status;
and the busiest departments. Filterable by period and status.

**Keyboard.** `Ctrl/Cmd+N` new · `Ctrl/Cmd+P` print · `Ctrl/Cmd+Shift+P` PDF ·
`Ctrl/Cmd+E` CSV · `Ctrl/Cmd+1/2/3/4` to switch views · `Esc` to leave a form.

**Messages.** Every action reports: a confirmation naming the file it wrote, or
a specific reason it could not. A failure never passes silently, and an empty
or malformed message can never reach the screen as "null" or "undefined".

---

## Guards

The renderer is our own code, but it is still the untrusted side of the bridge.
`electron/guards.js` validates everything crossing it, and the rules are
enforced in the main process where the page cannot reach them:

* **Types and shapes** — a filter that is not an object, an id list that is not
  a list, a number where text belongs: all refused with a readable message.
* **Lengths** — every text field has a ceiling, so nothing unbounded reaches
  the database. Long passwords are rejected before they are hashed.
* **Values** — statuses, print modes and roles must be one of the known set.
  Dates must be real calendar dates (`2026-02-30` is refused); times must be
  real clock times; a date range must run forwards.
* **Sizes** — at most 5000 records per action, and visitor/vehicle/escort rows
  are capped at the configured maximums.
* **Paging** — page and page size are clamped, never trusted, and a page past
  the end returns the last real page instead of a blank screen.
* **Authority** — the signed-in user lives in the main process. Every handler
  requires a session; delete and status changes require an administrator; and
  the Security Office block is stripped from anything a non-administrator
  sends, whatever the page claims.
* **Search text** — `%` and `_` are escaped, so typing one searches for that
  character instead of matching every record.

Queries are parameterised throughout; no user input is ever concatenated into
SQL.

---

## Checks

```bash
npm test
```

75 unit tests, plus 148 scripted checks driven through the real window (sign-up
validation, form validation, repeatable rows, search, every filter, pagination
boundaries, selection, exports, row expansion, inline status change, the IPC
guards, roles, session handling, live field validation, and the back/unsaved-changes behaviour).

The data-layer suite runs against the embedded engine always, and
**also against MySQL automatically when a server is reachable**, so both
engines are held to identical behaviour. Covered: CSV escaping, HTML escaping,
form validation, local-date handling, every guard, pagination boundaries,
search and filters, transaction rollback, and cascade deletes.

---

## How it is put together

```
electron/          main process — the only code that touches the database or disk
  main.js            window, menu, printing, PDF/CSV saving, session, IPC
  preload.cjs        the narrow bridge exposed to the page as window.api
  guards.js          validation for everything crossing that bridge
  config.js          reads .env; publicConfig() is the subset the UI may see
  db.js              queries, written once for both engines
  drivers/           sqlite.js and mysql.js — the only engine-specific code
  auth.js            scrypt hashing, sign-in, sign-up, lockout
  export.js          CSV and print-ready HTML
  schema.sqlite.sql / schema.mysql.sql
renderer/          the user interface — plain ES modules, no framework, no build step
```

The page runs with `contextIsolation` on, `nodeIntegration` off and a sandbox.
It cannot read the filesystem, reach the network, or see database credentials;
it can only call the channels listed in `preload.cjs`.

---

## Notes

* **Deletes are permanent** and cascade to that requisition's visitors,
  vehicles and escorts.
* **`npm run seed-demo`** fills the configured database with example records.
  Never run it against real data.
