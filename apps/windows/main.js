// Roznoma for Windows: the site in its own window, with system notifications
// and Google sign-in in the real browser (Google refuses embedded windows).
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

const BASE = process.env.ROZNOMA_URL || "https://nodinest.vercel.app";
let win = null;

const isOurs = (url) => {
  try {
    return new URL(url).origin === new URL(BASE).origin;
  } catch {
    return false;
  }
};

/** roznoma://auth?code=… back from the browser becomes this app's session. */
function openLink(url) {
  const code = /^roznoma:\/\/auth\?code=([\w-]+)/.exec(url || "")?.[1];
  if (!code || !win) return;
  win.loadURL(`${BASE}/api/app/handoff?code=${code}`);
  if (win.isMinimized()) win.restore();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: "#15161f",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(BASE);
  win.webContents.on("did-fail-load", (_e, code, _d, url, main) => {
    if (main && code !== -3 && isOurs(url)) win.loadFile(path.join(__dirname, "offline.html"));
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isOurs(url)) shell.openExternal(url);
    return { action: isOurs(url) ? "allow" : "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isOurs(url)) return;
    e.preventDefault();
    // Sign-in with Google goes through the browser and comes back by link.
    shell.openExternal(
      /accounts\.google\.com/.test(url) ? `${BASE}/app-login?from=mobile` : url,
    );
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.setAsDefaultProtocolClient("roznoma");
  app.setAppUserModelId("uz.roznoma.windows");
  app.on("second-instance", (_e, argv) => openLink(argv.find((a) => a.startsWith("roznoma://"))));
  app.whenReady().then(() => {
    // Only what the app really uses: the microphone for live talk, notifications.
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, details) =>
      cb(isOurs(details.requestingUrl) && ["media", "notifications"].includes(perm)),
    );
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
