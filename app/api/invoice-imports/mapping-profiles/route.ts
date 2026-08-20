import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { isInvoiceImportCanonicalField } from "@/lib/invoiceImport/mapping"
import { INVOICE_IMPORT_TEMPLATE_VERSION } from "@/lib/invoiceImport/template"
import { createClient } from "@/lib/supabase/server"

const ProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mapping: z.record(z.string().min(1), z.string().min(1)),
})

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const profiles = await withUserContext(user.id, (tx) =>
    tx.invoiceImportMappingProfile.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    }),
  )

  return NextResponse.json({
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      schemaVersion: profile.schemaVersion,
      mapping: profile.mapping,
      updatedAt: profile.updatedAt,
    })),
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = ProfileRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const invalidField = Object.values(parsed.data.mapping).find((field) => !isInvoiceImportCanonicalField(field))
  if (invalidField) {
    return NextResponse.json({ error: `Unknown target field: ${invalidField}` }, { status: 400 })
  }

  const { name, mapping } = parsed.data

  const profile = await withUserContext(user.id, (tx) =>
    tx.invoiceImportMappingProfile.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: { mapping, schemaVersion: INVOICE_IMPORT_TEMPLATE_VERSION },
      create: { userId: user.id, name, mapping, schemaVersion: INVOICE_IMPORT_TEMPLATE_VERSION },
    }),
  )

  return NextResponse.json({
    success: true,
    profile: {
      id: profile.id,
      name: profile.name,
      schemaVersion: profile.schemaVersion,
      mapping: profile.mapping,
      updatedAt: profile.updatedAt,
    },
  })
}
