import { getAuthenticatedUser } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

interface PendingXeroSelection {
  userId: string
  organisations: Array<{ id: string; name: string }>
}

function redirectToConnections(code: string): never {
  redirect(`/dashboard/settings/connections?source=xero&code=${encodeURIComponent(code)}`)
}

export default async function XeroSelectOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const { key } = await searchParams
  if (!key) redirectToConnections("selection_expired")

  const cookieStore = await cookies()
  const cookieName = `xero_pending_${key}`
  const pendingRaw = cookieStore.get(cookieName)?.value
  if (!pendingRaw) redirectToConnections("selection_expired")

  let pending: PendingXeroSelection
  try {
    pending = JSON.parse(pendingRaw) as PendingXeroSelection
  } catch {
    cookieStore.delete(cookieName)
    redirectToConnections("invalid_selection")
  }

  if (pending.userId !== user.id) {
    cookieStore.delete(cookieName)
    redirectToConnections("invalid_selection")
  }

  if (!pending.organisations?.length) {
    cookieStore.delete(cookieName)
    redirectToConnections("no_organisations")
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">Choose Your Xero Organisation</h2>
        <p className="text-sm text-gray-500">
          Select the organisation PaidSoon should sync invoices from.
        </p>
      </div>

      <form method="POST" action="/api/integrations/xero/select-org" className="space-y-4">
        <input type="hidden" name="key" value={key} />
        <fieldset className="space-y-2" aria-label="Xero organisations">
          {pending.organisations.map((organisation, index) => (
            <label
              key={organisation.id}
              className="flex items-center gap-3 border border-gray-200 rounded-md px-3 py-2 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="radio"
                name="organisationId"
                value={organisation.id}
                defaultChecked={index === 0}
                required
              />
              <span className="text-sm text-gray-800">{organisation.name}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Continue
          </button>
          <a
            href="/dashboard/settings/connections"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
