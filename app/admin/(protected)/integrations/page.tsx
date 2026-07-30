import { prismaAdmin } from "@/lib/db/admin"

const STATUS_BADGE_STYLES: Record<string, string> = {
  active: "bg-green-900 text-green-300",
  pending_first_sync: "bg-blue-900 text-blue-300",
  error: "bg-red-900 text-red-300",
  revoked: "bg-red-900 text-red-300",
  disconnected: "bg-gray-800 text-gray-400",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_first_sync: "Pending first sync",
  error: "Error",
  revoked: "Revoked",
  disconnected: "Disconnected",
}

export default async function AdminIntegrationsPage() {
  const connections = await prismaAdmin.accountingConnection.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, userId: true, provider: true, organisationName: true, status: true, lastSyncedAt: true, createdAt: true },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Integrations</h1>
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                <td className="px-4 py-3 text-gray-200">{c.organisationName}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{c.provider}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[c.status] ?? "bg-yellow-900 text-yellow-300"}`}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
