import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation } from "@/lib/admin/guard"

export default async function AdminStaffPage() {
  const ctx = await requireAdminElevation()
  const isOwner = ctx.platformRole.role === "platform_owner"

  const staff = await prismaAdmin.platformRole.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, role: true, status: true, createdAt: true },
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Staff</h1>
        {isOwner && (
          <a
            href="/admin/staff/invite"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm"
          >
            Invite Staff
          </a>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              {isOwner && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{s.userId}</td>
                <td className="px-4 py-3 text-gray-200 capitalize">{s.role.replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  <span className={s.status === "active" ? "text-green-400" : "text-red-400"}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                {isOwner && (
                  <td className="px-4 py-3">
                    {s.role !== "platform_owner" && s.userId !== ctx.userId && (
                      <form action={`/api/admin/staff/${s.userId}/disable`} method="POST">
                        <button
                          type="submit"
                          className="text-red-400 hover:text-red-300 text-xs"
                          onClick={(e) => {
                            if (!confirm("Disable this staff member?")) e.preventDefault()
                          }}
                        >
                          Disable
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
