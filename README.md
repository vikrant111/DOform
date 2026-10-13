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

> 📘 Setup, data location and MySQL guide below · 🔗 [`INSTALL.md`](INSTALL.md) for installing the built app on office PCs

---

## 📑 Contents

1. [🧰 What you need](#-1-what-you-need)
2. [📥 Get the project](#-2-get-the-project)
3. [🚀 Run the app (one double-click)](#-3-run-the-app-one-double-click)
4. [⌨️ Run the app (terminal, for developers)](#️-4-run-the-app-terminal-for-developers)
5. [💾 Where your data is stored (default)](#-5-where-your-data-is-stored-default)
6. [⚙️ The `.env` file — where every setting lives](#️-6-the-env-file--where-every-setting-lives)
7. [🐬 Switching to MySQL — step by step](#-7-switching-to-mysql--step-by-step)
8. [🌐 Sharing one MySQL database across several PCs](#-8-sharing-one-mysql-database-across-several-pcs)
9. [↩️ Going back to the local file](#️-9-going-back-to-the-local-file)
10. [📦 Building installers](#-10-building-installers)
11. [🩺 Troubleshooting](#-11-troubleshooting)
12. [🗂️ Project map](#️-12-project-map)

---

## 🧰 1. What you need

| | Requirement | Check it with |
|---|---|---|
| 🟢 | **Node.js 22 or newer** (LTS) — [nodejs.org](https://nodejs.org) | `node -v` → `v22.x.x` or higher |
| 📦 | **npm** (comes with Node.js) | `npm -v` |
| 🐙 | **Git** (only to clone / push) | `git --version` |
| 🐬 | **MySQL 8** — *optional*, only if you want a shared database | `mysql --version` |

> 💡 **Why Node 22?** The helper scripts (`reset-password`, `migrate-db`, `seed-demo`) use Node's built-in SQLite module, which arrived in Node 22. The app itself bundles its own engine.

---

## 📥 2. Get the project

```bash
git clone https://github.com/vikrant111/DOform.git
cd DOform
```

That's it — no database to install, no server to start. 🎉

---

## 🚀 3. Run the app (one double-click)

Two launcher files sit in the project root. On the **first run** each one automatically:

1. ✅ checks Node.js is installed
2. 📝 creates `.env` from `.env.example` (if `.env` doesn't exist yet)
3. 📦 runs `npm install` (if `node_modules/` doesn't exist yet)
4. ▶️ starts the app

| OS | File | How to run |
|---|---|---|
| 🪟 **Windows** | `run-app-windows.bat` | Double-click it in File Explorer |
| 🍎 **macOS** | `run-app-mac.command` | Double-click it in Finder |
| 🐧 **Linux** | — | Use the terminal: `npm install && npm start` |

### 🍎 macOS first-time note

macOS may block the file the first time. Fix it once:

```bash
chmod +x run-app-mac.command          # make it runnable (already set in the repo)
xattr -d com.apple.quarantine run-app-mac.command   # only if macOS says it's "from an unidentified developer"
```

Or: **right-click** `run-app-mac.command` → **Open** → **Open**.

### 🪟 Windows first-time note

If SmartScreen appears: **More info** → **Run anyway**.

### 👤 First launch inside the app

The first time the app opens there are no accounts, so it asks you to **create the administrator**. That first account is always an admin. 🛡️

---

## ⌨️ 4. Run the app (terminal, for developers)

```bash
npm install          # 📦 once
cp .env.example .env # 📝 once  (Windows: copy .env.example .env)
npm start            # ▶️ run the app
```

### 🧪 Useful commands

| Command | What it does |
|---|---|
| `npm start` | ▶️ Start the app |
| `npm run dev` | 🛠️ Start in dev mode |
| `npm test` | 🧪 Run all tests |
| `npm run seed-demo` | 🌱 Fill the database with sample records — **never on real data!** |
| `npm run reset-password -- --list` | 👥 List all accounts |
| `npm run reset-password -- <username> "<new password>"` | 🔑 Reset a password from the terminal |
| `npm run init-db` | 🐬 Create MySQL tables (MySQL only — see §7) |
| `npm run migrate-db -- --from sqlite --to mysql` | 🔁 Copy all data between databases |

---

## 💾 5. Where your data is stored (default)

By default the app uses **SQLite** — one single file, no server, nothing to install.

```ini
# .env
DB_ENGINE=sqlite
DB_FILE=
```

When `DB_FILE` is blank, the file is created automatically here:

| OS | 📍 Default location |
|---|---|
| 🪟 Windows | `%APPDATA%\CVP Requisition\doform.db` → e.g. `C:\Users\Ravi\AppData\Roaming\CVP Requisition\doform.db` |
| 🍎 macOS | `~/Library/Application Support/CVP Requisition/doform.db` |
| 🐧 Linux | `~/.config/CVP Requisition/doform.db` |

> 🔍 **Not sure?** Open the app → **Settings** → **Database** card → **Location** shows the exact path in use.

### 📂 Store it somewhere else

Edit **`.env`** and put a **full (absolute) path** in `DB_FILE`:

```ini
# 🪟 Windows example
DB_FILE=D:\CVP-Data\doform.db

# 🍎 macOS / 🐧 Linux example
DB_FILE=/Users/ravi/Documents/CVP-Data/doform.db
```

The folder is created automatically. Restart the app. ♻️

> ⚠️ Changing `DB_FILE` points the app at a **new, empty** file. To keep your records, either copy the old `doform.db` to the new place first, or use `npm run migrate-db` (see §9).

### 🛟 Backup & restore

| Action | How |
|---|---|
| 💾 **Backup** | Close the app, copy `doform.db` somewhere safe |
| ♻️ **Restore** | Close the app, put the copy back in the same place |

> 🔒 `doform.db` holds your records **and** accounts. It is never committed to Git (it lives outside the project folder).

---

## ⚙️ 6. The `.env` file — where every setting lives

**All configuration is in one file.** Nothing is configured in code.

| File | Purpose | Committed to Git? |
|---|---|---|
| 📄 `.env.example` | Template with every setting + comments | ✅ Yes |
| 🔐 `.env` | **Your** real settings (may hold the MySQL password) | ❌ No — git-ignored |

### 🔎 Which `.env` does the app read?

Checked in this order — the first one that exists wins (`electron/config.js`):

1. 🧭 Path in the environment variable `DOFORM_ENV_FILE`
2. 📦 Installed app: the `.env` next to the app (see table below)
3. 🛠️ Project folder: `./.env`
4. 📄 Project folder: `./.env.example` (fallback)

| Installed app on… | `.env` location |
|---|---|
| 🪟 Windows | `C:\Program Files\CVP Requisition\resources\.env` |
| 🍎 macOS | `/Applications/CVP Requisition.app/Contents/Resources/.env` |
| 🐧 Linux | `/opt/CVP Requisition/resources/.env` |

> 💡 In the app: **Settings** → **Open .env** opens the exact file it loaded.
>
> ♻️ **Always restart the app after editing `.env`.**

---

## 🐬 7. Switching to MySQL — step by step

Use MySQL when **several computers must share one set of records**. The same app, same screens — only the storage changes.

```
 ┌──────────────┐   step 1   ┌──────────────┐   step 3   ┌──────────────┐   step 4   ┌──────────────┐
 │ Install MySQL│ ─────────▶ │  Edit .env   │ ─────────▶ │ npm run      │ ─────────▶ │ Copy old data│
 │   (once)     │  step 2    │ DB_ENGINE=   │            │   init-db    │ (optional) │ migrate-db   │
 └──────────────┘            │   mysql      │            └──────────────┘            └──────┬───────┘
                             └──────────────┘                                               │ step 5
                                                                                            ▼
                                                                                   ┌──────────────┐
                                                                                   │ Restart app ✅│
                                                                                   └──────────────┘
```

### 🥇 Step 1 — Install & start MySQL

<details open>
<summary>🍎 <b>macOS</b> (Homebrew)</summary>

```bash
brew install mysql
brew services start mysql
mysql_secure_installation      # set the root password
```
</details>

<details>
<summary>🪟 <b>Windows</b></summary>

1. Download **MySQL Installer** from [dev.mysql.com/downloads/installer](https://dev.mysql.com/downloads/installer/)
2. Choose **Server only** → keep port **3306** → set a **root password** ✍️
3. Leave *"Configure MySQL Server as a Windows Service"* ticked ✅ (starts automatically)
</details>

<details>
<summary>🐧 <b>Linux</b> (Ubuntu / Debian)</summary>

```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation
```
</details>

✅ **Check it works:**

```bash
mysql -u root -p -e "SELECT VERSION();"
```

### 🥈 Step 2 — Edit `.env`

Open **`.env`** (project root, or the installed location from §6) and change the **Database** section:

```ini
# ── Database ─────────────────────────────────────────────────
DB_ENGINE=mysql                 # 👈 was: sqlite

# (DB_FILE is ignored when DB_ENGINE=mysql)
DB_FILE=

MYSQL_HOST=127.0.0.1            # 👈 this computer. Use the server's IP for a shared DB (§8)
MYSQL_PORT=3306
MYSQL_USER=doform               # 👈 the app's own MySQL user (created in step 3)
MYSQL_PASSWORD=Str0ng-Pass!2026 # 👈 CHANGE THIS — pick your own strong password
MYSQL_DATABASE=doform           # 👈 database name (created in step 3)
MYSQL_CONNECTION_LIMIT=10
```

> 🔐 **Never** leave `MYSQL_PASSWORD=change-me`. `.env` is git-ignored, so the password never reaches GitHub.

### 🥉 Step 3 — Create the database, user & tables

Run **once**, with your MySQL **root** password. This reads `.env` and creates the database, the `doform` user (with the password from `.env`) and every table:

```bash
# 🍎 macOS / 🐧 Linux
MYSQL_ROOT_USER=root MYSQL_ROOT_PASSWORD='yourRootPassword' npm run init-db
```

```powershell
# 🪟 Windows (PowerShell)
$env:MYSQL_ROOT_USER="root"; $env:MYSQL_ROOT_PASSWORD="yourRootPassword"; npm run init-db
```

```bat
:: 🪟 Windows (Command Prompt)
set MYSQL_ROOT_USER=root
set MYSQL_ROOT_PASSWORD=yourRootPassword
npm run init-db
```

✅ Expected output:

```
Using configuration from /path/to/.env
User 'doform' created and granted on 'doform'.
Schema ready in 'doform'.
```

> 🔁 Safe to run again — it only creates what's missing.
>
> 🛠️ **Prefer doing it by hand?** In `mysql -u root -p`:
>
> ```sql
> CREATE DATABASE doform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE USER 'doform'@'%' IDENTIFIED BY 'Str0ng-Pass!2026';
> GRANT ALL PRIVILEGES ON doform.* TO 'doform'@'%';
> FLUSH PRIVILEGES;
> ```
>
> Then load the tables: `mysql -u doform -p doform < electron/schema.mysql.sql`

### 🏅 Step 4 — Copy your existing records (optional)

Already have records in the local SQLite file? Copy **everything** (records + accounts) into MySQL:

```bash
npm run migrate-db -- --from sqlite --to mysql
```

Using a custom `DB_FILE`? Point at it:

```bash
npm run migrate-db -- --from sqlite --from-file "D:\CVP-Data\doform.db" --to mysql
```

✅ It verifies every row count at the end and **never modifies the source**. It refuses to write into a non-empty target unless you add `--replace`.

> ⏭️ Starting fresh? Skip this step — the app will ask you to create the admin on first launch.

### 🎯 Step 5 — Restart & verify

1. ♻️ Close and reopen the app (or `npm start` / double-click the launcher)
2. ⚙️ Go to **Settings** → **Database** card
3. ✅ It should say:

```
Engine    MySQL (shared server)
Location  doform@127.0.0.1:3306/doform
```

🎉 **Done — the app now uses MySQL.**

---

## 🌐 8. Sharing one MySQL database across several PCs

```
   🖥️ PC-1 (app) ─┐
   🖥️ PC-2 (app) ─┼──── office LAN ────▶ 🗄️ Server PC (MySQL, e.g. 192.168.1.50)
   🖥️ PC-3 (app) ─┘
```

### On the 🗄️ server PC (the one running MySQL)

**① Allow connections from the network.** Edit the MySQL config file:

| OS | File |
|---|---|
| 🍎 macOS (Homebrew) | `/opt/homebrew/etc/my.cnf` (Intel: `/usr/local/etc/my.cnf`) |
| 🐧 Linux | `/etc/mysql/mysql.conf.d/mysqld.cnf` |
| 🪟 Windows | `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini` |

```ini
[mysqld]
bind-address = 0.0.0.0     # 👈 was 127.0.0.1
```

Then restart MySQL (`brew services restart mysql` · `sudo systemctl restart mysql` · Windows: *Services* → MySQL80 → Restart).

**② Open port 3306 in the firewall** 🧱 — for the office LAN only, never the internet.

```powershell
# 🪟 Windows (PowerShell as Administrator)
New-NetFirewallRule -DisplayName "MySQL LAN" -Direction Inbound -Protocol TCP -LocalPort 3306 -RemoteAddress LocalSubnet -Action Allow
```

```bash
# 🐧 Linux (ufw)
sudo ufw allow from 192.168.1.0/24 to any port 3306
```

**③ Find the server's IP address** 🔢: `ipconfig` (Windows) · `ipconfig getifaddr en0` (macOS) · `hostname -I` (Linux)

**④ Run `init-db` once** on the server (§7 step 3).

### On every 🖥️ client PC

Edit that PC's **`.env`** — same values everywhere, only `MYSQL_HOST` points to the server:

```ini
DB_ENGINE=mysql
MYSQL_HOST=192.168.1.50         # 👈 the server PC's IP
MYSQL_PORT=3306
MYSQL_USER=doform
MYSQL_PASSWORD=Str0ng-Pass!2026 # 👈 same password as on the server
MYSQL_DATABASE=doform
```

Restart the app. ✅ Every PC now sees the same records **and the same accounts**.

> 🧪 Test the connection from a client: `mysql -h 192.168.1.50 -u doform -p doform -e "SELECT 1;"`
>
> 🔒 Still **no internet** involved — only the local network.

---

## ↩️ 9. Going back to the local file

```bash
# 1️⃣ Copy MySQL data back into a local file
npm run migrate-db -- --from mysql --to sqlite
```

```ini
# 2️⃣ .env
DB_ENGINE=sqlite
```

3️⃣ Restart the app. ✅

> 💡 Copy one SQLite file to another location: `npm run migrate-db -- --from sqlite --from-file ./old.db --to sqlite --to-file ./new.db`

---

## 📦 10. Building installers

```bash
npm run build:win     # 🪟 .exe installer (x64 + 32-bit) + portable .exe
npm run build:mac     # 🍎 .dmg + .zip (Intel + Apple Silicon)
npm run build:linux   # 🐧 .AppImage + .deb (x64 + arm64)
```

📁 Output goes to `dist/` (git-ignored — upload installers to **GitHub Releases** instead of committing them).

> ⚠️ The build copies your **current `.env`** next to the app (`extraResources` in `package.json`). Make sure it has the settings you want to ship — and **no real passwords** if you'll share the installer.

See [`INSTALL.md`](INSTALL.md) for installing on each PC.

---

## 🩺 11. Troubleshooting

| 😟 Problem | ✅ Fix |
|---|---|
| `'node' is not recognized` / `command not found: node` | Install Node.js 22+ from [nodejs.org](https://nodejs.org), then reopen the terminal |
| `No such built-in module: node:sqlite` | Your Node is too old → upgrade to Node 22+ |
| macOS: launcher won't open | `chmod +x run-app-mac.command`, then right-click → **Open** |
| **"Cannot reach the local database"** | MySQL only: is MySQL running? Is `MYSQL_HOST` right? Try `mysql -h <host> -u doform -p` |
| `ER_ACCESS_DENIED_ERROR` | `MYSQL_USER` / `MYSQL_PASSWORD` in `.env` don't match MySQL → re-run `init-db` or fix the password |
| `ER_BAD_DB_ERROR: Unknown database` | Run `npm run init-db` (§7 step 3) |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running → start it (§7 step 1) |
| Client PC can't reach server | Check `bind-address`, firewall port 3306, and the IP (§8) |
| Records are "missing" | **Settings → Database** — are you on the database you expect? Each SQLite PC has its own file |
| Changed `.env`, nothing happened | Restart the app ♻️ — and check **Settings → Open .env** is the file you edited |
| Admin locked out | `npm run reset-password -- --list`, then `npm run reset-password -- <username> "<new password>"` |

---

## 🗂️ 12. Project map

```
📁 project root
├── 🚀 run-app-windows.bat     ← double-click to run (Windows)
├── 🚀 run-app-mac.command     ← double-click to run (macOS)
├── 📄 .env.example            ← settings template  (committed)
├── 🔐 .env                    ← your settings      (git-ignored)
├── 📦 package.json            ← npm scripts & build config
├── 📘 README.md               ← this guide
├── 📗 INSTALL.md              ← installing on office PCs
├── 📁 electron/               ← main process (database, files, security)
│   ├── ⚙️ config.js           ← reads .env
│   ├── 🗄️ db.js               ← queries for both engines
│   ├── 📁 drivers/            ← sqlite.js · mysql.js
│   ├── 🐬 init-db.js          ← `npm run init-db`
│   ├── 📜 schema.sqlite.sql
│   └── 📜 schema.mysql.sql
├── 📁 renderer/               ← the user interface
├── 📁 scripts/                ← migrate-db · reset-password · seed-demo
├── 📁 tests/                  ← `npm test`
├── 📁 build/                  ← app icon
└── 📁 dist/                   ← built installers (git-ignored)
```


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

Full step-by-step setup, data location and MySQL guide: see the sections at the top of this file.

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

**Pass number.** Generated automatically the first time a requisition is saved, as
`CVP/UTK/<service no of the writer>/<DDMMYYYY>/<HHMMSS>` (e.g.
`CVP/UTK/12345A/13102026/204530`). It never changes afterwards and cannot be
edited from the page. The `CVP/UTK` part is `PASS_NO_PREFIX` in `.env`. The same
moment fills the pass line's *at … Hrs on (Date)*, so the number and the time on
the paper always agree.

Records written before the app generated numbers carry a hand-typed one —
`CVP-2026-0142` — and no issue time, so their pass line printed a number with
both blanks empty. Saving one replaces it, but a record nobody edits again never
reaches that path, so **printing one now issues it a proper pass and writes it
back**. Security Office only, written once, and a reprint shows the same number:
one that changed per print would be worse than a blank, because two papers for
one visitor would carry two numbers at the gate. Set `PASS_ON_PRINT=off` in
`.env` to leave old records alone.

**The form.** Every section of the paper CVP, with inline add/remove for
visitors, vehicles and escorts, capped at the configured maximums. The *For use
of Security Office* block is administrators only.

**Photograph.** One per requisition, at the top of the form — **Take photo**
uses the machine's camera, **Choose file** takes one already on it. Either way
the page shrinks it to about 400px and re-encodes it as a JPEG before it is
sent, so a camera frame of several megabytes is stored as roughly 30 KB; a
picture that still will not fit is shrunk further rather than refused after it
was taken.

**One photograph per pass**, whichever visitor it is of — not one per visitor.
It belongs to the requisition, because that is what a pass is for, and it prints
at the **top left** of the sheet where one is pasted on the paper form,
captioned with the first visitor's name. A column of pictures beside five
visitors would be four empty boxes and a narrower table.

A database written by the first version of this, which put the picture on the
visitor, has it moved onto the requisition when it is next opened — nothing
anybody photographed is lost.

**Which camera.** Whatever is attached — the lid camera on a laptop, a USB one
on a stand, or both. When there is more than one the dialog shows a picker, the
choice is remembered for next time, and a camera plugged in or unplugged while
the dialog is open appears or disappears from the list. A remembered camera that
has since been unplugged falls back to one that is there rather than failing.

Only PNG, JPEG and WebP are accepted. SVG is refused deliberately: it is a
document that can carry script, and the value ends up inside an `img src` on a
page the app renders. The camera is the only permission this app grants itself;
everything else a page could ask for is refused.

**Windows and macOS both block the camera at the system level**, and nothing in
the app can see that switch — so a refusal names the panel to open rather than
saying "check your settings". On Windows that is *Settings → Privacy & security
→ Camera → Let desktop apps access your camera*; on macOS, *System Settings →
Privacy & Security → Camera*.

To check a machine before anybody relies on it:

```bash
npm run check:camera             # the camera attached to this machine
npm run check:camera -- --fake   # no hardware needed: the plumbing only
```

It loads the real page, with the real preload, CSP and sandbox, so a refusal
there is a refusal the operator would have had. `npm test` deliberately does not
do this: that suite is plain Node and runs anywhere, while a camera needs a
window, a display and the operating system's permission.

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
