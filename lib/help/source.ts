import { defineDocs } from "fumadocs-mdx/macro"
import { loader } from "fumadocs-core/source"

const helpDocs = defineDocs({
  dir: "content/help",
})

// Scoped to content/help only — not shared with the internal docs/*.md corpus or /docs.
export const helpSource = loader({
  baseUrl: "/help",
  source: helpDocs.toFumadocsSource(),
})
