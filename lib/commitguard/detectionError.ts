export type CommitGuardDetectionErrorCode =
  | "settings_required"
  | "module_disabled"
  | "detection_disabled"
  | "access_denied"
  | "invalid_detection_settings"

const FAILURES = {
  settings_required: { status: 409, message: "Configure CommitGuard before running detection" },
  module_disabled: { status: 409, message: "CommitGuard is disabled" },
  detection_disabled: { status: 409, message: "Recurring commitment detection is disabled" },
  access_denied: { status: 403, message: "Upgrade required" },
  invalid_detection_settings: { status: 400, message: "Invalid CommitGuard detection settings" },
} as const

/** Safe public failure: never includes settings values, evidence or billing internals. */
export class CommitGuardDetectionError extends Error {
  readonly status: 400 | 403 | 409

  constructor(public readonly code: CommitGuardDetectionErrorCode) {
    super(FAILURES[code].message)
    this.name = "CommitGuardDetectionError"
    this.status = FAILURES[code].status
  }
}