import type { LegacyConversionReviewReason } from "@/lib/commitguard/legacyConversionReport"

/** Safe service/route contract; never contains tenant IDs or audit payloads. */
export type CandidateReviewResult =
  | { status: "updated"; commitmentId?: string }
  | { status: "not_found" }
  | {
      status: "conflict"
      reason: "conversion_review_required" | "candidate_already_converted" | "invalid_candidate_transition" | "candidate_schedule_review_required"
      commitmentId?: string
      reviewReasons?: LegacyConversionReviewReason[]
    }