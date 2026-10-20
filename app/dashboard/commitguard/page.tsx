import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getSubscriptionTier } from "@/lib/billing"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { loadCommitGuardWorkspace } from "@/lib/commitguard/workspaceLoader"
import { WorkspaceQuerySchema } from "@/lib/commitguard/workspace"
import { CommitGuardDashboard } from "@/components/dashboard/commitguard/CommitGuardDashboard"

export default async function CommitGuardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.JSX.Element> {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")
  const tier = await getSubscriptionTier(user.id)
  if (!hasPlanFeature(tier, "commitguard_core")) redirect("/dashboard?intent=commitguard")
  const parsed = WorkspaceQuerySchema.safeParse(await searchParams)
  if (!parsed.success) return <p role="alert">Invalid workspace navigation parameters. Use supported filters, valid UTC date ranges and whole-number pages. <a href="/dashboard/commitguard">Reset workspace filters</a></p>
  const workspace = await loadCommitGuardWorkspace(user.id, parsed.data)
  return <CommitGuardDashboard initial={workspace} params={parsed.data} />
}
