import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

interface PendingMyobSelection {
  userId: string
  organisations: Array<{ id: string; name: string }>
}

function redirectToConnections(code: string): never {
  redirect(`/dashboard/settings/connections?source=myob&code=${encodeURIComponent(code)}`)
}

export default async function MyobSelectOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const { key } = await searchParams
  if (!key) redirectToConnections("selection_expired")

  const cookieStore = await cookies()
  const cookieName = `myob_pending_${key}`
  const pendingRaw = cookieStore.get(cookieName)?.value
  if (!pendingRaw) redirectToConnections("selection_expired")

  let pending: PendingMyobSelection
  try {
    pending = JSON.parse(pendingRaw) as PendingMyobSelection
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
        <h2 className="text-lg font-semibold text-gray-900">Choose Your MYOB Company File</h2>
        <p className="text-sm text-gray-500">
          Select the company file PaidSoon should sync invoices from.
        </p>
      </div>

      <form method="POST" action="/api/integrations/myob/select-org" className="space-y-4">
        <input type="hidden" name="key" value={key} />
        <fieldset className="space-y-2" aria-label="MYOB company files">
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
