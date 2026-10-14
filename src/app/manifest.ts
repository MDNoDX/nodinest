import type { MetadataRoute } from "next";

/** Installable app (Mac: Chrome/Edge "Install" or Safari "Add to Dock"; iPhone/Android: home screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NodiNest",
    short_name: "NodiNest",
    description: "Bilimlar uchun shaxsiy makon — A home for everything you learn.",
    lang: "uz",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#f5f7fc",
    theme_color: "#2459e0",
    categories: ["books", "education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/nodinest-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      {
        name: "Kutubxona",
        url: "/library",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Manba qo‘shish",
        url: "/library/new",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Qidiruv",
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "AI yordamchi",
        url: "/assistant",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
