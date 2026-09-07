import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get("limit") ?? 25,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const categories = await withUserContext(user.id, async (tx) =>
    tx.importedBill.groupBy({
      by: ["expenseAccountName"],
      where: { userId: user.id },
      _sum: { amountCents: true },
      _count: { id: true },
      orderBy: [{ _sum: { amountCents: "desc" } }, { expenseAccountName: "asc" }],
      take: parsed.data.limit,
    }),
  )

  return NextResponse.json({
    categories: categories
      .filter((row) => row.expenseAccountName)
      .map((row) => ({
        id: row.expenseAccountName ?? "uncategorized",
        categoryName: row.expenseAccountName ?? "Uncategorized",
        totalSpendCents: row._sum.amountCents ?? 0,
        billCount: row._count.id,
      })),
  })
}
