# Building Ledger — Standalone Local Web App

Version: `2026.11.27-02`

This folder is a self-contained copy of Building Ledger. It runs as a local web application without a Manus or AI-platform account. Ledger data is stored locally in the browser origin, and local JSON backup/restore works without internet.

On computer screens 900px and wider, this release uses an expanded desktop layout: navigation moves to a fixed side panel, content uses the available browser width, and unit/expense cards use safe multi-column grids. Phones and narrow screens keep the compact mobile layout.

## Quick start

### Windows desktop
1. Install Node.js 18 or newer from [nodejs.org](https://nodejs.org/).
2. Extract the complete ZIP folder.
3. Double-click **`START-BUILDING-LEDGER.cmd`**.
4. The local server window opens and the browser opens at `http://127.0.0.1:3000`.
5. Keep the server window open while using the app. Close it to stop the app.

The package is a local web app and does not include a native `.exe`; the `.cmd` launcher is the Windows startup file and requires Node.js.

For manual startup, open a terminal in this folder and run `node server.js`.

### Android with Termux

1. Install Termux from F-Droid.
2. Copy/extract this folder into Termux-accessible storage.
3. In Termux, run `pkg update && pkg install nodejs`.
4. Change into this folder and run `node server.js`.
5. Open `http://127.0.0.1:3000` in the phone browser.

Keep the Termux process running while using the app. The app itself does not need internet for ledger work or local JSON files.

### Interactive Termux manager

The package includes `termux-building-ledger.sh`. It presents a menu for installing or updating from the newest ZIP in the phone's Downloads folder, starting/stopping the local server, checking status, and watching for a new ZIP.

```bash
chmod +x termux-building-ledger.sh
bash termux-building-ledger.sh
```

Choose `1` to install/update, `2` to start the server, or `5` to watch for updates. Watch mode checks Downloads every 60 seconds and automatically switches to a newly copied `Building-Ledger-Standalone-*.zip`. It verifies `CHECKSUMS.sha256`, keeps versioned releases under `~/building-ledger/releases`, and keeps the active version at `~/building-ledger/current`.

The automatic mode watches for a ZIP already present on the phone; it does not download software from the internet and it never deletes browser Local Storage. Export a JSON backup before updating as an additional safety measure.

### Install as a PWA on Android

The published HTTPS site can be installed as an app without Termux or Node.js. Open the Building Ledger HTTPS address in Chrome on Android, wait for the first load to finish, open the browser menu, and choose **Install app** or **Add to Home screen**. Confirm the installation. The icon opens Building Ledger in standalone mode, and the service worker keeps the app shell available offline after the first successful load. Ledger data remains in the browser's local storage; continue exporting JSON backups.

PWA installation requires HTTPS (or `localhost`/`127.0.0.1` for local testing). It cannot be installed reliably by opening an HTML file with `file://`. Google Drive OAuth and Apps Script synchronization work when the installed PWA is opened from its HTTPS address and the required Google configuration is valid; they still require internet.

## Google Drive and Apps Script

Google Drive OAuth and Apps Script synchronization are optional connected features. They require internet and a valid Google configuration. They do not work while fully offline.

For Google OAuth, use the local web address shown above rather than opening `index.html` directly with a `file://` URL. Add the exact redirect address required by the app to the OAuth client's authorized redirect URIs. The app does not include OAuth secrets.

### Receipt images

When adding or editing an expense, the **صور الفاتورة** control accepts up to three images per expense. Accepted extensions are JPG, JPEG, PNG, IMG, HEIC, and WebP. Each input must be no larger than 4 MB before compression. The app compresses it locally to a maximum width of 1000px, quality up to 30%, and a target below 300 KB when possible. HEIC support depends on the browser; if the browser cannot decode it, convert the image to JPG or PNG.

Receipt images are stored locally with the expense. In **إعدادات النسخ التلقائية**, choose whether JSON exports include the image data. In Google Drive settings, enable **رفع صور الفواتير تلقائيًا** if you want verified Drive uploads; each receipt then shows as local, needing upload, or uploaded. Drive uploads require an active OAuth connection and internet access.

The Apps Script source is in `apps-script/Code.gs` with its manifest in `apps-script/appsscript.json`. Deploy it separately in your Google account, set the Script Property token, and enter the deployed `/exec` URL and token in the app. The token is deliberately excluded from exported backups.

## Data and backups

- Ledger data is kept in browser local storage for this local origin.
- Use the app's JSON export regularly.
- Restoring a JSON file creates a rollback copy before replacement.
- Clearing browser data, changing the local origin, or uninstalling the browser/WebView can remove local data. Restore from JSON if necessary.
- Keep at least one JSON backup outside the phone.

## Included offline assets

The `public/vendor` directory contains local copies of the Excel, PDF/canvas, and IBM Plex Sans Arabic assets. The app does not need CDN access for those features.

## Included files

- `public/` — HTML, CSS, JavaScript, favicon, local libraries, and fonts.
- `public/manifest.webmanifest`, `public/sw.js`, and `public/pwa-icon-*.png` — PWA installation metadata, offline cache, and Android icons.
- `apps-script/` — optional Google Apps Script synchronization service.
- `server.js` — dependency-free local HTTP server.
- `package.json` — start command metadata.
- `START-BUILDING-LEDGER.cmd` — Windows double-click launcher that checks Node.js, starts the server, and opens the browser.
- `start-local-server.sh` and `start-local-server.cmd` — convenience launchers.
- `termux-building-ledger.sh` — interactive Termux installer, updater, server manager, and ZIP watch mode.

## Privacy and security

This package is controlled by you and does not require an AI-platform account. Protect the phone with a lock screen. Do not publish the Apps Script token or OAuth credentials. If a device is lost, revoke its Google OAuth access and rotate the Apps Script token.
