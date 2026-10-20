import { NextResponse } from "next/server"
import { z } from "zod"
import { requireFeature } from "@/lib/billing"
import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
import { CoverageIdSchema, CoverageInputSchema, CoverageUpdateSchema } from "@/lib/commitguard/coverage"
import { CommitGuardCoverageError, listCommitGuardCoverage, mutateCommitGuardCoverage } from "@/lib/commitguard/coverageService"
import { createClient } from "@/lib/supabase/server"

async function handle(request: Request, method: "GET" | "POST" | "PUT" | "DELETE"): Promise<NextResponse> {
  try {
    const { data: { user }, error } = await (await createClient()).auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!await requireFeature(user.id, "commitguard_core")) return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    if ([...new URL(request.url).searchParams].length) return NextResponse.json({ error: "Query parameters are not supported" }, { status: 400 })
    if (method === "GET") return NextResponse.json({ coverage: await listCommitGuardCoverage(user.id) })
    const body: unknown = await request.json().catch(() => null)
    const schema = method === "POST" ? CoverageInputSchema : method === "PUT" ? CoverageUpdateSchema : z.strictObject({ id: CoverageIdSchema })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Invalid coverage input" }, { status: 400 })
    // Each variant is reparsed rather than allowing arbitrary body keys into a
    // mutation. Tenant identity and work/revision fields are never inputs.
    const operation = method === "POST" ? { kind: "create" as const, input: CoverageInputSchema.parse(parsed.data) } :
      method === "PUT" ? (() => { const { id, ...input } = CoverageUpdateSchema.parse(parsed.data); return { kind: "update" as const, id, input } })() :
        { kind: "delete" as const, id: z.strictObject({ id: CoverageIdSchema }).parse(parsed.data).id }
    return NextResponse.json({ coverage: await mutateCommitGuardCoverage(user.id, operation) }, { status: method === "POST" ? 201 : 200 })
  } catch (error) {
    if (error instanceof CommitGuardCoverageError) return NextResponse.json({ error: error.reason }, { status: error.status })
    console.error("[commitguard/coverage] Request failed")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export const GET = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => handle(request, "GET"))
export const POST = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => handle(request, "POST"))
export const PUT = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => handle(request, "PUT"))
export const DELETE = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => handle(request, "DELETE"))