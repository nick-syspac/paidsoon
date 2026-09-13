import { prismaAdmin } from "@/lib/db/admin"
import { StaffActivityFeed } from "@/components/admin/StaffActivityFeed"
import { getAdminModuleSurface } from "@/lib/admin/moduleSurface"
import Link from "next/link"

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
      // eslint-disable-next-line react-hooks/purity
      where: { sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  const adminModules = getAdminModuleSurface()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Platform Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Tenants" value={tenantCount} />
        <StatCard label="Active Subscriptions" value={activeSubCount} />
        <StatCard label="Emails (24h)" value={recentEmailLogs} />
        <StatCard label="Audit Events (total)" value={recentAuditEvents.length} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Admin operation surface</h2>
          <span className="text-xs uppercase tracking-wide text-gray-400">Current modules</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {adminModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group rounded-xl border border-gray-800 bg-gray-900 p-4 transition hover:border-blue-500/60 hover:bg-gray-800"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">{module.label}</h3>
                <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-blue-200">
                  {module.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-300">{module.description}</p>
              <div className="mt-4 inline-flex items-center text-sm font-medium text-blue-300 group-hover:text-blue-200">
                Open {module.label}
                <span aria-hidden="true" className="ml-2">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

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

      <StaffActivityFeed />
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
