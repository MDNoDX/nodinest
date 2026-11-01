import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The app opens the live site inside a native shell: the same pages, plus what
 * only an installed app can do (system notifications, alarms that ring with the
 * phone locked, sign-in through the system browser). Without internet it shows
 * www/offline.html until the site's own offline pages are in place.
 */
const config: CapacitorConfig = {
  appId: "uz.roznoma.app",
  appName: "Röznoma",
  webDir: "www",
  server: {
    url: process.env.ROZNOMA_URL ?? "https://nodinest.vercel.app",
    errorPath: "offline.html",
    allowNavigation: ["nodinest.vercel.app"],
  },
  ios: { contentInset: "automatic", limitsNavigationsToAppBoundDomains: true, scheme: "Roznoma" },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 900, backgroundColor: "#15161f", showSpinner: false },
    LocalNotifications: { smallIcon: "ic_stat_roznoma", iconColor: "#b4b7ff" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
