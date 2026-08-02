import { helpSource } from "@/lib/help/source"
import { createFromSource } from "fumadocs-core/search/server"

// Scoped to content/help only, per help-center spec's "no non-help content in results" requirement.
export const { GET } = createFromSource(helpSource, {
  language: "english",
})
