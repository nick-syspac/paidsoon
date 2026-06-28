import type { UserProfile } from "@/lib/generated/prisma/client"

interface Props {
  profile: UserProfile
}

export function SubscriptionSection({ profile }: Props) {
  const stripeCustomerUrl = profile.stripeCustomerId
    ? `https://dashboard.stripe.com/customers/${profile.stripeCustomerId}`
    : null

  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Subscription</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-gray-500">Plan</dt>
          <dd className="text-gray-100 capitalize">{profile.subscriptionTier}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Status</dt>
          <dd className="text-gray-100 capitalize">{profile.subscriptionStatus}</dd>
        </div>
        {profile.trialEndsAt && (
          <div>
            <dt className="text-gray-500">Trial ends</dt>
            <dd className="text-gray-100">
              {new Date(profile.trialEndsAt).toLocaleDateString("en-AU")}
              {profile.trialEndsAt < new Date() && (
                <span className="ml-2 text-red-400 text-xs">(lapsed)</span>
              )}
            </dd>
          </div>
        )}
        {profile.subscriptionCurrentPeriodEnd && (
          <div>
            <dt className="text-gray-500">Period end</dt>
            <dd className="text-gray-100">
              {new Date(profile.subscriptionCurrentPeriodEnd).toLocaleDateString("en-AU")}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-gray-500">Stripe customer</dt>
          <dd className="text-gray-100">
            {stripeCustomerUrl ? (
              <a
                href={stripeCustomerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-mono text-xs"
              >
                {profile.stripeCustomerId} ↗
              </a>
            ) : (
              <span className="text-gray-500">Not linked</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
