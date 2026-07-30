"use client"

import { useState, useCallback, useRef } from "react"

export interface CustomerSearchResult {
  userId: string
  email: string
  displayName: string | null
  subscriptionTier: string
  subscriptionStatus: string
  stripeCustomerId: string | null
  createdAt: string
  lastSeenAt: string | null
}

const TIER_LABELS: Record<string, string> = {
  free: "Starter",
  starter: "Starter",
  pro: "Solo",
  solo: "Solo",
  small_business: "Small Business",
  accountant_partner: "Accountant Partner",
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  trialing: "text-blue-400",
  cancelled: "text-red-400",
  past_due: "text-yellow-400",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function CustomerSearchClient() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CustomerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([])
      setSearched(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const resp = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(q)}`)
      if (!resp.ok) {
        const body = await resp.json()
        throw new Error(body.error || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setResults(data.results || [])
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed")
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 350)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    doSearch(query)
  }

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search by email (min 3 characters)..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={query.length < 3 || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded text-sm transition-colors"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {searched && !loading && (
        <div>
          <p className="text-gray-400 text-sm mb-3">
            {results.length === 0
              ? "No customers found."
              : `${results.length} result${results.length === 1 ? "" : "s"} found.`}
          </p>

          {results.length > 0 && (
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-left">
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Last Seen</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((customer) => (
                    <tr key={customer.userId} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                      <td className="px-4 py-3 text-gray-200">{customer.email}</td>
                      <td className="px-4 py-3 text-gray-300">{customer.displayName || <span className="text-gray-600">—</span>}</td>
                      <td className="px-4 py-3 text-gray-300">{TIER_LABELS[customer.subscriptionTier] ?? customer.subscriptionTier}</td>
                      <td className={`px-4 py-3 ${STATUS_COLORS[customer.subscriptionStatus] ?? "text-gray-400"}`}>
                        {customer.subscriptionStatus}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(customer.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(customer.lastSeenAt)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/admin/customers/${customer.userId}`}
                          className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                        >
                          View →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state before search */}
      {!searched && !loading && (
        <div className="text-center text-gray-600 py-12">
          <p className="text-sm">Enter a customer email to search.</p>
          <p className="text-xs mt-1">All searches are logged in the audit trail.</p>
        </div>
      )}
    </div>
  )
}
