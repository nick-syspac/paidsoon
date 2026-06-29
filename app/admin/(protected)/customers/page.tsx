import { requireAdminElevation } from "@/lib/admin/guard"
import CustomerSearchClient from "./CustomerSearchClient"

export default async function AdminCustomersPage() {
  await requireAdminElevation()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Customer Support Search</h1>
        <p className="text-gray-400 text-sm mt-1">
          Search customers to view their account, invoices, and subscription details. All searches are logged.
        </p>
      </div>

      <CustomerSearchClient />
    </div>
  )
}
