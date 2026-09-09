import { notFound, redirect } from "next/navigation"

import { OwnersDigestView } from "@/components/dashboard/ownersDigest/OwnersDigestView"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { getOwnersDigestById, listOwnersDigestHistory } from "@/lib/ownersDigest/service"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function OwnersDigestDetailPage({
  params,
}: {
  params: Promise<{ digestId: string }>
}) {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessOwnersDigest(tier)) {
    redirect("/dashboard?intent=owners_digest")
  }

  const { digestId } = await params
  const [digest, history] = await Promise.all([
    getOwnersDigestById(user.id, digestId),
    listOwnersDigestHistory(user.id).catch(() => []),
  ])

  if (!digest) notFound()

  return <OwnersDigestView digest={digest} history={history} showHistory={false} />
}
