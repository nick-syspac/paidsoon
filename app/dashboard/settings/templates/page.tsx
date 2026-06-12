import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { hasPlanFeature, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { TemplatesClient } from "@/components/settings/TemplatesClient"

export default async function TemplatesSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: { subscriptionTier: true },
    }),
  )

  const tier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const hasBasic = hasPlanFeature(tier, "basic_templates")
  const canCustomize = hasPlanFeature(tier, "custom_reminder_templates")

  if (!hasBasic) {
    return (
      <div className="max-w-lg space-y-4">
        <h2 className="text-base font-medium text-gray-900">Reminder Templates</h2>
        <p className="text-sm text-gray-500">
          Personalised reminder emails get paid faster. Here&apos;s a taste of what you unlock on a paid plan.
        </p>

        {/* Sample template previews — blurred/locked */}
        <div className="space-y-3 relative">
          <div className="border border-gray-200 rounded-md px-4 py-3 opacity-40 blur-[0.5px] select-none pointer-events-none">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Gentle Reminder</p>
            <p className="text-sm font-medium text-gray-800">Subject: Friendly reminder — invoice #&#123;invoice_number&#125; due soon</p>
            <p className="text-sm text-gray-600 mt-1">
              Hi &#123;client_name&#125;, just a quick heads-up that invoice #&#123;invoice_number&#125; for &#123;amount&#125; is due on &#123;due_date&#125;.
              No action needed if you&apos;ve already sent payment — thank you!
            </p>
          </div>

          <div className="border border-gray-200 rounded-md px-4 py-3 opacity-40 blur-[0.5px] select-none pointer-events-none">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Overdue Follow-up</p>
            <p className="text-sm font-medium text-gray-800">Subject: Invoice #&#123;invoice_number&#125; is now overdue</p>
            <p className="text-sm text-gray-600 mt-1">
              Hi &#123;client_name&#125;, invoice #&#123;invoice_number&#125; for &#123;amount&#125; was due on &#123;due_date&#125; and is now overdue.
              Please arrange payment at your earliest convenience or reply if you have any questions.
            </p>
          </div>

          <div className="border border-gray-200 rounded-md px-4 py-3 opacity-40 blur-[0.5px] select-none pointer-events-none">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Final Notice</p>
            <p className="text-sm font-medium text-gray-800">Subject: Final notice — invoice #&#123;invoice_number&#125;</p>
            <p className="text-sm text-gray-600 mt-1">
              Hi &#123;client_name&#125;, this is a final notice for invoice #&#123;invoice_number&#125; totalling &#123;amount&#125;.
              Please contact us immediately to avoid further action.
            </p>
          </div>

          {/* Lock overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-5 py-4 text-center">
              <p className="text-sm font-semibold text-gray-900 mb-1">Unlock reminder templates</p>
              <p className="text-xs text-gray-500 mb-3">Available on the Starter plan and above</p>
              <a
                href="/dashboard/settings/subscription"
                className="inline-block bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Upgrade now
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <TemplatesClient
      data={{
        tier,
        templates: [
          { id: "gentle-reminder", label: "Gentle reminder" },
          { id: "payment-followup", label: "Payment follow-up" },
        ],
        canCustomize,
      }}
    />
  )
}
