import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"

export default async function BillingCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; reason?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  const params = await searchParams

  // Resolve tier: prefer the ?plan query param, fall back to the user's stored tier.
  let tier = normalizeSubscriptionTier(params.plan ?? null)
  if (!params.plan) {
    const profile = await withUserContext(user.id, (tx) =>
      tx.userProfile.findUnique({
        where: { userId: user.id },
        select: { subscriptionTier: true },
      }),
    )
    tier = normalizeSubscriptionTier(profile?.subscriptionTier)
  }

  // Forward the session cookie so the API route can authenticate via supabase.auth.getUser().
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")

  let checkoutUrl: string | null = null
  let errorMessage: string | null = null

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/checkout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ tier }),
        cache: "no-store",
      },
    )

    const data: unknown = await res.json()

    if (
      res.ok &&
      typeof data === "object" &&
      data !== null &&
      "url" in data &&
      typeof (data as Record<string, unknown>).url === "string"
    ) {
      checkoutUrl = (data as Record<string, unknown>).url as string
    } else {
      errorMessage =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as Record<string, unknown>).error === "string"
          ? ((data as Record<string, unknown>).error as string)
          : "Something went wrong while setting up your subscription."
    }
  } catch {
    errorMessage =
      "Could not connect to the billing service. Please try again."
  }

  // Redirect must happen outside the try/catch block.
  if (checkoutUrl) redirect(checkoutUrl)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Unable to start checkout
        </h1>
        <p className="text-sm text-gray-600">{errorMessage}</p>
        <a
          href="/dashboard"
          className="inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Return to dashboard
        </a>
      </div>
    </div>
  )
}
