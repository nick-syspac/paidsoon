import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation } from "@/lib/admin/guard"
import AdminDevicesPageClient from "./AdminDevicesClient"

export default async function AdminDevicesPage() {
  const ctx = await requireAdminElevation()

  const devices = await prismaAdmin.adminDevice.findMany({
    where: { adminUserId: ctx.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      publicKeyFingerprint: true,
      keyType: true,
      status: true,
      createdAt: true,
      lastVerifiedAt: true,
      revokedAt: true,
    },
  })

  return <AdminDevicesPageClient initialDevices={devices} />
}
