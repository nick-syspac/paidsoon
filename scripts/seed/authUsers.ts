/**
 * scripts/seed/authUsers.ts
 *
 * Provisions the Supabase Auth users that back the development seed accounts.
 *
 * WHY THIS EXISTS
 * ───────────────
 * PaidSoon has no organisation/membership model — a tenant *is* a Supabase auth
 * user, and `user_profiles.userId` must equal `auth.users.id` for RLS
 * (`auth.uid()`) to resolve. A seed that invents synthetic UUIDs therefore
 * produces data nobody can sign in and look at. This module creates (or reuses)
 * real auth users in the development project so the seeded profiles, invoices
 * and RLS policies all line up with an account you can actually log into.
 *
 * SAFETY
 * ──────
 * - Only ever creates users on the reserved `.test` seed domains.
 * - Never deletes, disables or renames any auth user.
 * - Only updates the password of an account it owns (a seed-domain address), so
 *   documented development credentials stay accurate across re-runs.
 * - Unrelated auth users are read (to match by email) but never written.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"

/** All seed auth accounts live under these reserved, undeliverable domains. */
export const SEED_EMAIL_DOMAINS = [
  "coastline-demo.test",
  "yarravalley-demo.test",
] as const

/**
 * Password used for every seeded development account.
 * Overridable with `SEED_USER_PASSWORD`. Development only — these accounts exist
 * solely in the development Supabase project and own nothing but demo data.
 */
export const DEFAULT_SEED_PASSWORD = "PaidSoonDev!2026"

export interface SeedAuthAccount {
  /** Stable key used by the seed to reference the resulting user id. */
  key: string
  email: string
  displayName: string
}

export interface ProvisionedAuthUser extends SeedAuthAccount {
  userId: string
  /** How the user id was obtained. */
  source: "created" | "existing" | "synthetic"
}

function assertSeedDomain(email: string): void {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase()
  if (!SEED_EMAIL_DOMAINS.includes(domain as (typeof SEED_EMAIL_DOMAINS)[number])) {
    throw new Error(
      `Refusing to provision seed auth user "${email}": domain must be one of ${SEED_EMAIL_DOMAINS.join(", ")}.`,
    )
  }
}

/** Page through auth users and index the seed-domain ones by email. */
async function findExistingByEmail(
  admin: SupabaseClient,
  emails: Set<string>,
): Promise<Map<string, User>> {
  const found = new Map<string, User>()
  const perPage = 1000

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`Failed to list Supabase auth users: ${error.message}`)

    for (const user of data.users) {
      const email = user.email?.toLowerCase()
      if (email && emails.has(email)) found.set(email, user)
    }

    if (data.users.length < perPage) break
    if (found.size === emails.size) break
  }

  return found
}

/**
 * Deterministic fallback user ids, used when Supabase admin credentials are not
 * available. These are syntactically valid UUIDs that can never collide with a
 * real `auth.users` row, so the data is still seeded (and RLS-isolated) — it
 * just cannot be signed into until it is relinked to a real auth user.
 */
export function syntheticUserId(index: number): string {
  return `5eed${String(index).padStart(4, "0")}-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`
}

export interface ProvisionOptions {
  accounts: SeedAuthAccount[]
  password?: string
  /** Set true to skip Supabase entirely and use synthetic ids. */
  skipAuth?: boolean
}

export async function provisionSeedAuthUsers({
  accounts,
  password = process.env.SEED_USER_PASSWORD ?? DEFAULT_SEED_PASSWORD,
  skipAuth = false,
}: ProvisionOptions): Promise<ProvisionedAuthUser[]> {
  for (const account of accounts) assertSeedDomain(account.email)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY

  if (skipAuth || !supabaseUrl || !serviceKey) {
    if (!skipAuth) {
      console.warn(
        "  ! NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set — falling back to synthetic user ids.",
      )
      console.warn("    Seeded accounts will NOT be signable-in until relinked to real auth users.")
    }
    return accounts.map((account, index) => ({
      ...account,
      userId: syntheticUserId(index + 1),
      source: "synthetic" as const,
    }))
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const emails = new Set(accounts.map((a) => a.email.toLowerCase()))
  const existing = await findExistingByEmail(admin, emails)

  const provisioned: ProvisionedAuthUser[] = []

  for (const account of accounts) {
    const match = existing.get(account.email.toLowerCase())

    if (match) {
      // Seed-owned account: refresh the password and metadata so the documented
      // development credentials keep working after a re-run.
      const { error } = await admin.auth.admin.updateUserById(match.id, {
        password,
        email_confirm: true,
        user_metadata: { ...match.user_metadata, full_name: account.displayName, seed: true },
      })
      if (error) throw new Error(`Failed to refresh seed auth user ${account.email}: ${error.message}`)

      provisioned.push({ ...account, userId: match.id, source: "existing" })
      continue
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.displayName, seed: true },
    })
    if (error || !data.user) {
      throw new Error(
        `Failed to create seed auth user ${account.email}: ${error?.message ?? "no user returned"}`,
      )
    }

    provisioned.push({ ...account, userId: data.user.id, source: "created" })
  }

  return provisioned
}
