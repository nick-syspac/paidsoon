import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createDepositGuardJob,
  DepositGuardAccessError,
  listDepositGuardJobs,
} from "@/lib/depositGuard/jobs"
import { depositGuardJobCreateSchema } from "@/lib/depositGuard/jobForms"
import { createClient } from "@/lib/supabase/server"

const querySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
})

function toPreviewErrorResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Upgrade required",
      code: "preview_only",
      previewMode: true,
    },
    { status: 403 },
  )
}

function toAccessErrorResponse(error: DepositGuardAccessError): NextResponse {
  if (error.code === "preview_only") {
    return toPreviewErrorResponse()
  }

  if (error.code === "active_job_limit_reached") {
    return NextResponse.json(
      {
        error: "DepositGuard active job limit reached",
        code: "active_job_limit_reached",
      },
      { status: 403 },
    )
  }

  return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
}

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedQuery = querySchema.safeParse({
    includeArchived: new URL(request.url).searchParams.get("includeArchived") ?? undefined,
  })

  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 })
  }

  try {
    const jobs = await listDepositGuardJobs(user.id, {
      includeArchived: parsedQuery.data.includeArchived,
    })
    return NextResponse.json({ jobs })
  } catch (error) {
    if (error instanceof DepositGuardAccessError) {
      return toAccessErrorResponse(error)
    }

    console.error("[GET /api/deposit-guard/jobs] Failed to list jobs", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = depositGuardJobCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const job = await createDepositGuardJob(user.id, {
      ...parsed.data,
      currency: parsed.data.currency.toLowerCase(),
      expectedStartDate: parsed.data.expectedStartDate
        ? new Date(parsed.data.expectedStartDate)
        : null,
      expectedCompletionDate: parsed.data.expectedCompletionDate
        ? new Date(parsed.data.expectedCompletionDate)
        : null,
      createdBy: user.id,
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    if (error instanceof DepositGuardAccessError) {
      return toAccessErrorResponse(error)
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/deposit-guard/jobs] Failed to create job", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
