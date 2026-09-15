import { defineDocs } from "fumadocs-mdx/macro"
import { loader } from "fumadocs-core/source"

const blogDocs = defineDocs({
  dir: "content/blog",
})

export const blogSource = loader({
  baseUrl: "/blog",
  source: blogDocs.toFumadocsSource(),
})