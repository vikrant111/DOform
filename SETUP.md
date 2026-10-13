# 🛂 CVP Requisition — Setup Guide

> 📘 Everything you need to **set up**, **run**, **find your data**, and **switch to MySQL** — step by step.
>
> 🔗 Related docs: [`README.md`](README.md) (features & architecture) · [`INSTALL.md`](INSTALL.md) (installing the built app on office PCs)

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
├── 📘 SETUP.md                ← this guide
├── 📗 README.md / INSTALL.md
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

<p align="center">Made for INS Utkrosh Security Section · 🔒 offline by design</p>
