import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PaidSoon",
    short_name: "PaidSoon",
    description:
      "Financial control platform for Australian small businesses: get paid, stop waste, control costs, and plan ahead.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    icons: [
      {
        src: "/paidsoon-logo.png",
        sizes: "1086x160",
        type: "image/png",
      },
    ],
  }
}
