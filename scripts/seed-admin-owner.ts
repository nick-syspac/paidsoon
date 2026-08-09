/**
 * scripts/seed-admin-owner.ts
 *
 * Bootstrap the first platform owner record.
 *
 * Usage:
 *   npm run seed:admin-owner
 *
 * Required env vars:
 *   PLATFORM_OWNER_EMAIL   — email of the existing Supabase auth user to promote
 *   DATABASE_URL           — Prisma connection string
 *
 * Optional env vars:
 *   ADMIN_SSH_PUBLIC_KEY   — OpenSSH ssh-ed25519 public key to enrol as first device
 *   ADMIN_DEVICE_LABEL     — Label for the first device (default: "bootstrap-device")
 *
 * This script is idempotent: running it twice for the same email is safe.
 * It cannot be triggered via an HTTP endpoint (Design D8).
 */

import "./_loadEnv"
import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"
import { parseOpenSshPublicKey } from "@/lib/admin/ssh"

const PLATFORM_OWNER_EMAIL = process.env.PLATFORM_OWNER_EMAIL
const ADMIN_SSH_PUBLIC_KEY = process.env.ADMIN_SSH_PUBLIC_KEY
const ADMIN_DEVICE_LABEL = process.env.ADMIN_DEVICE_LABEL ?? "bootstrap-device"

if (!PLATFORM_OWNER_EMAIL) {
  console.error("Error: PLATFORM_OWNER_EMAIL environment variable is required")
  process.exit(1)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required")
  process.exit(1)
}

async function main() {
  console.log(`Seeding platform owner for: ${PLATFORM_OWNER_EMAIL}`)

  // Find the Supabase user by email (requires service role key)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers()

  if (listError) {
    console.error("Error listing Supabase users:", listError.message)
    process.exit(1)
  }

  const user = usersData.users.find(
    (u) => u.email?.toLowerCase() === PLATFORM_OWNER_EMAIL!.toLowerCase()
  )

  if (!user) {
    console.error(`Error: No Supabase auth user found with email: ${PLATFORM_OWNER_EMAIL}`)
    process.exit(1)
  }

  console.log(`Found Supabase user: ${user.id}`)

  // Upsert PlatformRole (idempotent)
  const existing = await prismaAdmin.platformRole.findUnique({
    where: { userId: user.id },
  })

  if (existing) {
    if (existing.role === "platform_owner") {
      console.log("Platform owner role already exists for this user. No changes made.")
    } else {
      console.log(`User has existing role: ${existing.role}. To change the role, update the record manually.`)
    }
  } else {
    await prismaAdmin.platformRole.create({
      data: {
        userId: user.id,
        role: "platform_owner",
        status: "active",
        createdBy: "seed-admin-owner-script",
      },
    })
    console.log("Created platform_owner role.")
  }

  // Optionally enrol first admin device
  if (ADMIN_SSH_PUBLIC_KEY) {
    let pubKeyBytes: Uint8Array<ArrayBuffer>
    let fingerprint: string
    let keyType: string

    try {
      const parsedKey = parseOpenSshPublicKey(ADMIN_SSH_PUBLIC_KEY)
      pubKeyBytes = parsedKey.publicKeyBytes as Uint8Array<ArrayBuffer>
      fingerprint = parsedKey.fingerprint
      keyType = parsedKey.keyType
    } catch (err) {
      console.error("Error: Invalid ADMIN_SSH_PUBLIC_KEY:", err instanceof Error ? err.message : err)
      process.exit(1)
    }

    const existingDevice = await prismaAdmin.adminDevice.findUnique({
      where: { publicKeyFingerprint: fingerprint },
    })

    if (existingDevice) {
      console.log(`Device with fingerprint ${fingerprint} already enrolled. No changes made.`)
    } else {
      await prismaAdmin.adminDevice.create({
        data: {
          adminUserId: user.id,
          label: ADMIN_DEVICE_LABEL,
          publicKeyBytes: pubKeyBytes,
          publicKeyFingerprint: fingerprint,
          keyType,
          status: "active",
          createdBy: "seed-admin-owner-script",
        },
      })
      console.log(`Enrolled admin device: ${ADMIN_DEVICE_LABEL} (${fingerprint})`)
    }
  } else {
    console.log("ADMIN_SSH_PUBLIC_KEY not set — skipping device enrolment. Enrol a device via the admin UI.")
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
