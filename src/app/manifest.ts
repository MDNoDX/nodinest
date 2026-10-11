import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NodiNest",
    short_name: "NodiNest",
    description: "Bilimlar uchun shaxsiy makon — A home for everything you learn.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fc",
    theme_color: "#2459e0",
    icons: [{ src: "/nodinest-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
