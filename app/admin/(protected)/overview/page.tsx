import { prismaAdmin } from "@/lib/db/admin"

/**
 * /admin/overview — System health summary.
 * Protected by the (protected) route group layout.
 */
export default async function AdminOverviewPage() {
  const [tenantCount, activeSubCount, recentAuditEvents, recentEmailLogs] = await Promise.all([
    prismaAdmin.userProfile.count(),
    prismaAdmin.userProfile.count({ where: { subscriptionStatus: "active" } }),
    prismaAdmin.adminAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        actorEmail: true,
        platformRole: true,
        action: true,
        success: true,
        createdAt: true,
      },
    }),
    prismaAdmin.emailLog.count({
      where: { sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Platform Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Tenants" value={tenantCount} />
        <StatCard label="Active Subscriptions" value={activeSubCount} />
        <StatCard label="Emails (24h)" value={recentEmailLogs} />
        <StatCard label="Audit Events (total)" value={recentAuditEvents.length} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Recent Audit Events</h2>
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {recentAuditEvents.map((event) => (
                <tr key={event.id} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{event.actorEmail}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{event.action}</td>
                  <td className="px-4 py-3">
                    <span className={event.success ? "text-green-400" : "text-red-400"}>
                      {event.success ? "OK" : "FAIL"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
    </div>
  )
}
