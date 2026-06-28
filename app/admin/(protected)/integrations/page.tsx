import { prismaAdmin } from "@/lib/db/admin"

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
                <td className="px-4 py-3 text-gray-400 capitalize">{c.status}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
