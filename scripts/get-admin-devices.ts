/**
 * scripts/get-admin-devices.ts
 *
 * Print all registered admin devices and their IDs.
 * Use the Device ID value when completing the /admin/verify challenge.
 *
 * Usage:
 *   npm run get:admin-devices
 *
 * Optional: filter by email
 *   PLATFORM_OWNER_EMAIL=you@example.com npm run get:admin-devices
 */

import "./_loadEnv"
import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"

const filterEmail = process.env.PLATFORM_OWNER_EMAIL

async function main() {
  let filterUserId: string | undefined

  if (filterEmail) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required to filter by email")
      process.exit(1)
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
    const { data, error } = await supabase.auth.admin.listUsers()
    if (error) { console.error("Error listing users:", error.message); process.exit(1) }
    const user = data.users.find((u) => u.email?.toLowerCase() === filterEmail.toLowerCase())
    if (!user) { console.error(`No Supabase user found with email: ${filterEmail}`); process.exit(1) }
    filterUserId = user.id
    console.log(`Filtering for user: ${filterEmail} (${filterUserId})`)
  }

  const devices = await prismaAdmin.adminDevice.findMany({
    where: filterUserId ? { adminUserId: filterUserId } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      publicKeyFingerprint: true,
      keyType: true,
      status: true,
      createdAt: true,
      adminUserId: true,
    },
  })

  if (devices.length === 0) {
    console.log("No admin devices found.")
    console.log("Run `npm run seed:admin-owner` with ADMIN_SSH_PUBLIC_KEY set to enrol one.")
    return
  }

  console.log(`\nFound ${devices.length} admin device(s):\n`)
  for (const d of devices) {
    console.log(`  Device ID  : ${d.id}`)
    console.log(`  Label      : ${d.label}`)
    console.log(`  Status     : ${d.status}`)
    console.log(`  Key type   : ${d.keyType}`)
    console.log(`  Fingerprint: ${d.publicKeyFingerprint}`)
    console.log(`  User ID    : ${d.adminUserId}`)
    console.log(`  Created    : ${d.createdAt.toISOString()}`)
    console.log()
  }
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
