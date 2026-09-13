import { NextResponse } from "next/server"
import { z } from "zod"

import {
  archiveDepositGuardJob,
  DepositGuardAccessError,
  updateDepositGuardJob,
} from "@/lib/depositGuard/jobs"
import { createClient } from "@/lib/supabase/server"

const paramsSchema = z.object({ jobId: z.string().trim().min(1) })

const patchJobSchema = z
  .object({
    customerId: z.string().trim().min(1).optional().nullable(),
    externalQuoteId: z.string().trim().min(1).optional().nullable(),
    externalQuoteNumber: z.string().trim().min(1).optional().nullable(),
    accountingProvider: z.string().trim().min(1).max(60).optional().nullable(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    reference: z.string().trim().max(120).optional().nullable(),
    currency: z.string().trim().length(3).optional(),
    quotedAmountCents: z.number().int().min(0).optional().nullable(),
    sourceAmountCents: z.number().int().min(0).optional(),
    taxAmountCents: z.number().int().min(0).optional().nullable(),
    sourceTaxMode: z.enum(["inclusive", "exclusive"]).optional(),
    depositType: z.enum(["none", "percentage", "fixed"]).optional(),
    depositPercentage: z.number().min(0).max(100).optional().nullable(),
    depositFixedAmountCents: z.number().int().min(0).optional().nullable(),
    roundingMode: z.enum(["nearest", "up", "down"]).optional(),
    expectedStartDate: z.string().datetime().optional().nullable(),
    expectedCompletionDate: z.string().datetime().optional().nullable(),
  })
  .strict()

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
  if (error.code === "preview_only") return toPreviewErrorResponse()
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  const parsed = patchJobSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const expectedStartDate =
      parsed.data.expectedStartDate == null
        ? parsed.data.expectedStartDate
        : new Date(parsed.data.expectedStartDate)
    const expectedCompletionDate =
      parsed.data.expectedCompletionDate == null
        ? parsed.data.expectedCompletionDate
        : new Date(parsed.data.expectedCompletionDate)

    const updated = await updateDepositGuardJob(user.id, parsedParams.data.jobId, {
      ...parsed.data,
      currency: parsed.data.currency?.toLowerCase(),
      expectedStartDate,
      expectedCompletionDate,
    })

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ job: updated })
  } catch (error) {
    if (error instanceof DepositGuardAccessError) {
      return toAccessErrorResponse(error)
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[PATCH /api/deposit-guard/jobs/[jobId]] Failed to update job", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  try {
    const archived = await archiveDepositGuardJob(user.id, parsedParams.data.jobId)
    if (!archived) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ archived })
  } catch (error) {
    if (error instanceof DepositGuardAccessError) {
      return toAccessErrorResponse(error)
    }

    console.error("[DELETE /api/deposit-guard/jobs/[jobId]] Failed to archive job", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
