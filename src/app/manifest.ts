import type { MetadataRoute } from "next";

/** Installable app (Mac: Chrome/Edge "Install" or Safari "Add to Dock"; iPhone/Android: home screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NodiNote",
    short_name: "NodiNote",
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
