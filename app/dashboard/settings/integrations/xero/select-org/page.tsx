import { redirect } from "next/navigation"

export default async function LegacyXeroSelectOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const params = await searchParams
  const suffix = params.key ? `?key=${encodeURIComponent(params.key)}` : ""
  redirect(`/dashboard/settings/connections/xero/select-org${suffix}`)
}
