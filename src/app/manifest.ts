import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NodiNest",
    short_name: "NodiNest",
    description: "Bilimlar uchun shaxsiy makon — A home for everything you learn.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ec",
    theme_color: "#1f4d3a",
    icons: [{ src: "/nodinest-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
