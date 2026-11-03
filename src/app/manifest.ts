import type { MetadataRoute } from "next";

/**
 * Installable app. Android (Chrome / Samsung): a real app (WebAPK) in the app
 * list, with the store-like install dialog that the screenshots fill. Mac /
 * Windows: Chrome / Edge "Install" or Safari "Add to Dock". iPhone: Safari's
 * "Add to Home Screen".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Röznoma",
    short_name: "Röznoma",
    description: "Bilimlar uçun şaxsiy makon — A home for everything you learn.",
    lang: "uz",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#f6f4ef",
    theme_color: "#4338ca",
    categories: ["books", "education", "productivity"],
    prefer_related_applications: false,
    // A link to the site opens the app that is already open, not a second window.
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    screenshots: [
      {
        src: "/screenshots/phone-media.webp",
        sizes: "780x1688",
        type: "image/webp",
        form_factor: "narrow",
        label: "Media",
      },
      {
        src: "/screenshots/phone-plans.webp",
        sizes: "780x1688",
        type: "image/webp",
        form_factor: "narrow",
        label: "Rejalar",
      },
      {
        src: "/screenshots/wide-media.webp",
        sizes: "1280x800",
        type: "image/webp",
        form_factor: "wide",
        label: "Media",
      },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/nodinest-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      {
        name: "Darsxona",
        url: "/library",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Manba qöşiş",
        url: "/library/new",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Qidiruv",
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "AI yordamçi",
        url: "/assistant",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
