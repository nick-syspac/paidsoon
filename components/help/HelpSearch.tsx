"use client"

import Link from "next/link"
import { useDocsSearch } from "fumadocs-core/search/client"
import { fetchClient } from "fumadocs-core/search/client/fetch"

export function HelpSearch() {
  const { search, setSearch, query } = useDocsSearch({
    client: fetchClient({ api: "/api/help/search" }),
  })

  const results = query.data && query.data !== "empty" ? query.data : []
  const pageResults = results.filter((result) => result.type === "page")

  return (
    <div className="mb-6">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search the help centre…"
        aria-label="Search help articles"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {search.length > 0 ? (
        <ul className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-100 bg-white shadow-sm overflow-hidden">
          {query.isLoading ? (
            <li className="px-3 py-2 text-sm text-gray-400">Searching…</li>
          ) : pageResults.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">No results</li>
          ) : (
            pageResults.map((result) => (
              <li key={result.id}>
                <Link
                  href={result.url}
                  className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {result.content}
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
