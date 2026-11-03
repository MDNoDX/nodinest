/**
 * Runs before React (in <head>): the browser's "install this app" offer comes
 * once, early, and would be lost by pages that open later (Settings → App).
 * It is kept on window and announced with "nn:install".
 */
export const INSTALL_SCRIPT = `addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__nnInstall=e;dispatchEvent(new Event("nn:install"))});addEventListener("appinstalled",function(){window.__nnInstall=null;window.__nnInstalled=true;dispatchEvent(new Event("nn:install"))});`;
