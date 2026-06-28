import { prismaAdmin } from "@/lib/db/admin"

export default async function AdminTenantsPage() {
  const tenants = await prismaAdmin.userProfile.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
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
      <h1 className="text-2xl font-bold text-white">Tenants</h1>
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
                <td className="px-4 py-3 text-gray-200">{t.displayName ?? t.userId}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{t.subscriptionTier}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{t.subscriptionStatus}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
