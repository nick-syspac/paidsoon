import Link from "next/link"
import { requireAdminElevation } from "@/lib/admin/guard"
import { TrainingCreateForm } from "@/components/admin/training/TrainingCreateForm"

export default async function AdminTrainingCreatePage() {
  await requireAdminElevation({ minRole: "platform_admin" })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400">
          <Link href="/admin/training" className="hover:text-white">
            ← Training Studio
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">Create Training Guide</h1>
        <p className="mt-1 text-sm text-gray-400">Create a draft guide using structured JSON content.</p>
      </div>

      <TrainingCreateForm />
    </div>
  )
}
