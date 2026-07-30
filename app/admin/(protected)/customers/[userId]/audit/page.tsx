import { notFound } from "next/navigation"
import { requireAdminElevation } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"

function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export default async function CustomerAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  await requireAdminElevation()

  const { userId } = await params
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1", 10))
  const take = 50
  const skip = (page - 1) * take

  const profile = await prismaAdmin.userProfile.findUnique({
    where: { userId },
    select: { userId: true, displayName: true },
  })

  if (!profile) notFound()

  const [events, total] = await Promise.all([
    prismaAdmin.adminAuditEvent.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        platformRole: true,
        success: true,
        reason: true,
        resourceId: true,
        details: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prismaAdmin.adminAuditEvent.count({ where: { targetUserId: userId } }),
  ])

  const totalPages = Math.ceil(total / take)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
          <a href={`/admin/customers/${userId}`} className="hover:text-white">
            ← {profile.displayName || userId}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-gray-400 text-sm mt-1">
          All admin actions that affected this customer ({total} total)
        </p>
      </div>

      {events.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-8 text-center text-gray-600 text-sm">
          No audit events found for this customer.
        </div>
      ) : (
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                  <td className="px-4 py-3 text-gray-200 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{e.actorEmail}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{e.platformRole.replace(/_/g, " ")}</td>
                  <td className={`px-4 py-3 text-xs font-semibold ${e.success ? "text-green-400" : "text-red-400"}`}>
                    {e.success ? "OK" : "FAIL"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{e.reason || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{e.ipAddress}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`?page=${page - 1}`}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`?page=${page + 1}`}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
