/**
 * scripts/seed-support-account.ts
 *
 * Seed the internal support/owner account: Syspac Pty Ltd.
 *
 * This is a single-purpose script for the operator's own tenant. It grants
 * the full `small_business` tier with `active` status and NO Stripe customer
 * or subscription — the intended "free" internal account. Feature gating in
 * lib/billing.ts keys off `subscriptionTier` only, so this account is fully
 * functional without ever touching Stripe Checkout.
 *
 * Also promotes the same user to `platform_owner` (support admin access) and
 * optionally enrols the first admin SSH device.
 *
 * Usage:
 *   npm run seed:support-account
 *
 * Optional env overrides:
 *   SUPPORT_ACCOUNT_EMAIL      — default: nick@syspac.com.au
 *   SUPPORT_COMPANY_NAME       — default: Syspac Pty Ltd
 *   SUPPORT_ACCOUNT_TIER       — default: small_business
 *   ADMIN_SSH_PUBLIC_KEY       — OpenSSH public key to enrol as first admin device
 *   ADMIN_DEVICE_LABEL         — default: "support-device"
 *
 * Required env (already in .env.local): SUPABASE_PROJECT_REF,
 * SUPABASE_DB_PASSWORD, SUPABASE_SECRET_KEY.
 *
 * Idempotent: safe to re-run; existing rows are topped up, never duplicated.
 * Not reachable via HTTP (same pattern as seed-admin-owner.ts).
 */

import "./_loadEnv"
import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"
import { parseOpenSshPublicKey } from "@/lib/admin/ssh"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"

const SUPPORT_EMAIL = process.env.SUPPORT_ACCOUNT_EMAIL ?? "nick@syspac.com.au"
const COMPANY_NAME = process.env.SUPPORT_COMPANY_NAME ?? "Syspac Pty Ltd"
const TIER = normalizeSubscriptionTier(process.env.SUPPORT_ACCOUNT_TIER ?? "small_business")
const ADMIN_SSH_PUBLIC_KEY = process.env.ADMIN_SSH_PUBLIC_KEY
const ADMIN_DEVICE_LABEL = process.env.ADMIN_DEVICE_LABEL ?? "support-device"

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required")
  process.exit(1)
}

async function findAuthUserId(email: string): Promise<string> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  )
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) {
    console.error("Error listing Supabase users:", error.message)
    process.exit(1)
  }
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(
      `Error: No Supabase auth user found with email: ${email}\n` +
        "Sign up via the app first — this script promotes an existing account.",
    )
    process.exit(1)
  }
  return user.id
}

async function main() {
  console.log(`Seeding support account: ${SUPPORT_EMAIL} (${COMPANY_NAME})`)

  const userId = await findAuthUserId(SUPPORT_EMAIL)
  console.log(`Found Supabase user: ${userId}`)

  // 1. UserProfile — full tier, active, no Stripe. displayName carries the
  //    company name; EmailSettings.fromName is left for the user to set via
  //    the settings UI (fromName is the sender identity on reminder emails).
  await prismaAdmin.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      subscriptionTier: TIER,
      subscriptionStatus: "active",
      trialEndsAt: null,
      displayName: COMPANY_NAME,
    },
    update: {
      subscriptionTier: TIER,
      subscriptionStatus: "active",
      trialEndsAt: null,
      displayName: COMPANY_NAME,
    },
  })
  console.log(`UserProfile: tier=${TIER}, status=active, no Stripe — displayName="${COMPANY_NAME}"`)

  // 2. Default follow-up schedule (mirrors lib/actions/auth.ts bootstrap).
  await prismaAdmin.schedule.upsert({
    where: { userId },
    create: { userId, email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 },
    update: {},
  })
  console.log("Schedule: default 3/10/21-day cadence ensured.")

  // 3. Platform owner role (support admin access).
  const existingRole = await prismaAdmin.platformRole.findUnique({ where: { userId } })
  if (existingRole) {
    if (existingRole.role === "platform_owner") {
      console.log("PlatformRole: platform_owner already present. No changes.")
    } else {
      await prismaAdmin.platformRole.update({
        where: { userId },
        data: { role: "platform_owner", status: "active" },
      })
      console.log(`PlatformRole: upgraded ${existingRole.role} → platform_owner.`)
    }
  } else {
    await prismaAdmin.platformRole.create({
      data: {
        userId,
        role: "platform_owner",
        status: "active",
        createdBy: "seed-support-account-script",
      },
    })
    console.log("PlatformRole: platform_owner created.")
  }

  // 4. Optional first admin device.
  if (ADMIN_SSH_PUBLIC_KEY) {
    try {
      const { publicKeyBytes, fingerprint, keyType } = parseOpenSshPublicKey(ADMIN_SSH_PUBLIC_KEY)
      const existingDevice = await prismaAdmin.adminDevice.findUnique({
        where: { publicKeyFingerprint: fingerprint },
      })
      if (existingDevice) {
        console.log(`AdminDevice: fingerprint ${fingerprint} already enrolled. No changes.`)
      } else {
        await prismaAdmin.adminDevice.create({
          data: {
            adminUserId: userId,
            label: ADMIN_DEVICE_LABEL,
            publicKeyBytes: publicKeyBytes as Uint8Array<ArrayBuffer>,
            publicKeyFingerprint: fingerprint,
            keyType,
            status: "active",
            createdBy: "seed-support-account-script",
          },
        })
        console.log(`AdminDevice: enrolled "${ADMIN_DEVICE_LABEL}" (${fingerprint})`)
      }
    } catch (err) {
      console.error("Error: Invalid ADMIN_SSH_PUBLIC_KEY:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  } else {
    console.log("ADMIN_SSH_PUBLIC_KEY not set — skipping device enrolment.")
  }

  console.log("Done.")
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
