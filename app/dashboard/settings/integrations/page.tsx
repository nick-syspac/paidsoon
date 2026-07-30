import { redirect } from "next/navigation"
import { buildConnectionsSearch } from "@/lib/settings/connectionFlash"

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; source?: string; code?: string }>
}) {
  const params = await searchParams
  const query = buildConnectionsSearch(params)
  redirect(query ? `/dashboard/settings/connections?${query}` : "/dashboard/settings/connections")
}
