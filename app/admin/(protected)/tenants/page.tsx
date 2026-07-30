import Link from "next/link"
import { prismaAdmin } from "@/lib/db/admin"

interface Props {
  searchParams: Promise<{ search?: string }>
}

export default async function AdminTenantsPage({ searchParams }: Props) {
  const { search } = await searchParams
  const query = search?.trim() || undefined

  const tenants = await prismaAdmin.userProfile.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    where: query
      ? { displayName: { contains: query, mode: "insensitive" } }
      : undefined,
    select: {
      id: true,
      userId: true,
      displayName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      createdAt: true,
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tenants</h1>
      </div>

      {/* Search form */}
      <form method="GET" className="flex gap-2">
        <input
          type="text"
          name="search"
          defaultValue={query ?? ""}
          placeholder="Search by display name…"
          className="flex-1 max-w-sm bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded px-3 py-2 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm px-4 py-2 rounded"
        >
          Search
        </button>
        {query && (
          <Link
            href="/admin/tenants"
            className="bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm px-3 py-2 rounded"
          >
            Clear
          </Link>
        )}
      </form>

      {tenants.length === 0 ? (
        <div className="bg-gray-900 rounded-lg px-6 py-10 text-center text-gray-400 text-sm">
          No tenants found{query ? ` matching "${query}"` : ""}.
        </div>
      ) : (
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/tenants/${t.userId}`}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {t.displayName ?? t.userId}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{t.subscriptionTier}</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{t.subscriptionStatus}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(t.createdAt).toLocaleDateString("en-AU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
