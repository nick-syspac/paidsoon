import { prismaAdmin } from "@/lib/db/admin"

export default async function AdminSubscriptionsPage() {
  const profiles = await prismaAdmin.userProfile.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, userId: true, displayName: true, subscriptionTier: true, subscriptionStatus: true, subscriptionCurrentPeriodEnd: true, trialEndsAt: true, createdAt: true },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period End</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                <td className="px-4 py-3 text-gray-200">{p.displayName ?? p.userId}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{p.subscriptionTier}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{p.subscriptionStatus}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {p.subscriptionCurrentPeriodEnd ? new Date(p.subscriptionCurrentPeriodEnd).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
