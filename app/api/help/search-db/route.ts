import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { createClient } from "@/lib/supabase/server"
import {
  filterAndRankTrainingSearch,
  type TrainingAudience,
  type TrainingContentSearchCandidate,
} from "@/lib/help/trainingContent"

const SearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
})

/**
 * DB-backed help/training search endpoint with audience enforcement.
 * Uses prismaAdmin intentionally because training tables are admin-authored platform tables
 * with deny-all RLS for anon/authenticated tenant roles.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = SearchQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { q, limit } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const audiences: TrainingAudience[] = user ? ["public", "signed_in"] : ["public"]

  // Search strategy (v1): pre-filter by lifecycle and audience in DB, then rank by title/summary/body text match in application code.
  const candidates = await prismaAdmin.trainingContent.findMany({
    where: {
      lifecycleState: "published",
      audience: { in: audiences },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 250,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      content: true,
      audience: true,
    },
  })

  const results = filterAndRankTrainingSearch(
    candidates as TrainingContentSearchCandidate[],
    q,
    { isAuthenticated: !!user },
    limit ?? 10
  )

  return NextResponse.json({ results })
}
