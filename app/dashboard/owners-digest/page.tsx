import { redirect } from "next/navigation"

import { OwnersDigestView } from "@/components/dashboard/ownersDigest/OwnersDigestView"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { getCurrentOwnersDigest, listOwnersDigestHistory } from "@/lib/ownersDigest/service"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function OwnersDigestPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessOwnersDigest(tier)) {
    redirect("/dashboard?intent=owners_digest")
  }

  const [digest, history] = await Promise.all([
    getCurrentOwnersDigest(user.id),
    listOwnersDigestHistory(user.id).catch(() => []),
  ])

  return <OwnersDigestView digest={digest} history={history} />
}
