# CVP Requisition — installation guide

For whoever sets the application up on each computer. No internet connection is
needed at any stage, for installing or for running it.

---

## 1. Pick the right file

Everything is in the `dist` folder. Copy **one** file to the computer you are
installing on — a USB stick is fine.

| Computer | File to copy |
|---|---|
| **Windows** (any, 32- or 64-bit) | `CVP-Requisition-Setup-1.0.0.exe` |
| Windows, 64-bit only | `CVP-Requisition-Setup-1.0.0-x64.exe` |
| Windows, older 32-bit only | `CVP-Requisition-Setup-1.0.0-ia32.exe` |
| Windows, **no installation allowed** | `CVP-Requisition-Portable-1.0.0-x64.exe` |
| **macOS**, Apple Silicon (M1–M4) | `CVP-Requisition-1.0.0-mac-arm64.dmg` |
| **macOS**, Intel | `CVP-Requisition-1.0.0-mac-x64.dmg` |
| **Linux**, Ubuntu/Debian | `CVP-Requisition-1.0.0-linux-amd64.deb` |
| **Linux**, anything else | `CVP-Requisition-1.0.0-linux-x86_64.AppImage` |

If unsure on Windows, use `CVP-Requisition-Setup-1.0.0.exe` — it works on both.

To check a file survived the USB copy, compare it against `SHA256SUMS.txt`:

```bash
# macOS / Linux
shasum -a 256 -c SHA256SUMS.txt
```
```powershell
# Windows
certutil -hashfile "CVP-Requisition-Setup-1.0.0.exe" SHA256
```

---

## 2. Install it

### Windows

1. Double-click `CVP-Requisition-Setup-1.0.0.exe`.
2. Windows will say **"Windows protected your PC"**. This is expected — the
   application is not code-signed. Click **More info**, then **Run anyway**.
3. Choose where to install it (the default is fine) and finish.
4. You now have **CVP Requisition** on the Desktop and in the Start menu.

*Portable version:* no installation. Copy
`CVP-Requisition-Portable-1.0.0-x64.exe` anywhere — including the USB stick
itself — and double-click it. The same SmartScreen notice appears once.

### macOS

1. Open the `.dmg` and drag **CVP Requisition** into **Applications**.
2. **Right-click** the app in Applications and choose **Open**, then **Open**
   again. You must do it this way the first time — double-clicking will only
   say the developer cannot be verified and refuse.
3. After that, launch it normally from Launchpad or Spotlight.

### Linux

```bash
# Debian / Ubuntu
sudo apt install ./CVP-Requisition-1.0.0-linux-amd64.deb
# then find "CVP Requisition" in the applications menu, under Office

# Anything else
chmod +x CVP-Requisition-1.0.0-linux-x86_64.AppImage
./CVP-Requisition-1.0.0-linux-x86_64.AppImage
```

---

## 3. First launch

The first time the application opens on a computer there are no accounts, so
it asks you to **create the administrator account**. Choose a username and a
password of at least 8 characters including a letter and a number.

That first account is always an administrator. Everyone else can create their
own account from the sign-in screen (they become operators), unless you turn
that off — see section 5.

**Administrators** can delete records, change a requisition's status, fill in
the *For use of Security Office* block, and manage every account (create,
reset passwords, change roles, remove). **Operators** can create and edit
requisitions, search, print and export, and change their own password.

Both are managed from the **Accounts** section in the sidebar.

### If someone forgets their password

Any administrator fixes it in seconds: **Accounts** in the sidebar →
find the person → **Reset password** → type a new one → tell them directly.
They can change it themselves afterwards. This also clears any lockout.

If the *only* administrator is locked out, on the computer holding the data:

```bash
npm run reset-password -- --list
npm run reset-password -- <username> "<new password>"
```

### Service numbers — why they matter

When creating an account, fill in the person's **service number**. Each
requisition records the service number of whoever wrote it, so if that account
is ever deleted and a new one is made with the same service number, all their
earlier requisitions are reconnected to it automatically. The app tells you how
many as it happens.

**No requisition is ever lost when an account is removed.** Requisitions belong
to the unit, not to an individual — everyone signed in sees all of them, and
removing an account removes only the sign-in, never a record.

---

## 4. Where the data is kept

By default each computer keeps its own records in a single file:

| | |
|---|---|
| Windows | `%APPDATA%\CVP Requisition\doform.db` |
| macOS | `~/Library/Application Support/CVP Requisition/doform.db` |
| Linux | `~/.config/CVP Requisition/doform.db` |

**To back up, copy that file.** To restore, put it back. The exact path for the
machine in front of you is shown on the app's **Settings** screen.

### If several computers must share one set of records

Install MySQL on one office computer, then on every machine edit `.env` (see
below) and set:

```
DB_ENGINE=mysql
MYSQL_HOST=192.168.1.50      # the office computer's address
MYSQL_USER=doform
MYSQL_PASSWORD=...
MYSQL_DATABASE=doform
```

On the office computer run `npm run init-db` once to create the tables. This
uses the local network only — still no internet.

---

## 5. Changing settings

Every setting lives in a plain text file called `.env`, installed beside the
application:

| | |
|---|---|
| Windows | `C:\Program Files\CVP Requisition\resources\.env` |
| macOS | `/Applications/CVP Requisition.app/Contents/Resources/.env` |
| Linux | `/opt/CVP Requisition/resources/.env` |

Open it in Notepad or any text editor. You can change the unit name, the form
title, how many visitors a form allows, the password rules, how many rows the
records list shows, and the colours. **Restart the application after saving.**

The Settings screen inside the app shows the values currently in use, and has
an **Open .env** button that opens the file for you.

---

## 6. If something goes wrong

| What you see | What to do |
|---|---|
| "Windows protected your PC" | **More info** → **Run anyway**. Expected; the app is unsigned. |
| macOS: "developer cannot be verified" | Right-click the app → **Open** → **Open**. Only needed once. |
| "Cannot reach the local database" | Only possible with `DB_ENGINE=mysql`: check the MySQL computer is on and the address in `.env` is right. |
| Someone forgot their password | An administrator resets it under **Accounts → Reset password**. If no administrator can sign in, use `npm run reset-password` on the machine holding the data. |
| Someone rejoined and wants their old records back | Create their account with the **same service number**; their earlier requisitions reconnect automatically. |
| Records are missing | Check Settings shows the database you expect — a machine using its own local file will not see another machine's records. |

---

## 7. Removing it

* **Windows** — Settings → Apps → *CVP Requisition* → Uninstall.
* **macOS** — drag the app from Applications to the Bin.
* **Linux** — `sudo apt remove doform`, or delete the AppImage.

Updating to a newer version keeps all existing records — the database is
upgraded in place on first launch.

Uninstalling does **not** delete the records. To remove those as well, delete
the data file listed in section 4.
