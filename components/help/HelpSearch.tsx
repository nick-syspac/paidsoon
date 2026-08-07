"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

interface HelpSearchResult {
  id: string
  slug: string
  title: string
  summary: string | null
  href: string
}

export function HelpSearch() {
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<HelpSearchResult[]>([])

  useEffect(() => {
    if (search.trim().length < 2) {
      return
    }

    const controller = new AbortController()

    const timeout = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(
          `/api/help/search-db?q=${encodeURIComponent(search.trim())}&limit=10`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          setResults([])
          return
        }

        const payload = (await response.json()) as { results?: HelpSearchResult[] }
        setResults(payload.results ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [search])

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
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-400">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">No results</li>
          ) : (
            results.map((result) => (
              <li key={result.id}>
                <Link
                  href={result.href}
                  className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {result.title}
                  {result.summary ? (
                    <span className="block mt-0.5 text-xs text-gray-500">{result.summary}</span>
                  ) : null}
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
