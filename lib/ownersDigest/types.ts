export type OwnersDigestStatus = "healthy" | "watch" | "action_required" | "critical"

export type OwnersDigestSeverity = "critical" | "warning" | "opportunity" | "positive" | "info"

export type OwnersDigestFrequency = "off" | "daily" | "weekly" | "monthly"

export type OwnersDigestSection = "needs_attention" | "opportunities" | "positive_changes" | "info"

export type OwnersDigestSource =
  | "paidsoon"
  | "spendleak"
  | "costguard"
  | "cashplan"
  | "taxbuffer"
  | "depositguard"
  | "commitguard"
  | "marginguard"
  | "runwayguard"

export type OwnersDigestProviderStatus =
  | "complete"
  | "partial"
  | "stale"
  | "unavailable"
  | "not_configured"
  | "not_entitled"

export interface OwnersDigestSettingsSnapshot {
  enabled: boolean
  emailEnabled: boolean
  frequency: OwnersDigestFrequency
  deliveryDay: string
  deliveryTime: string
  timezone: string
  includeNeedsAttention: boolean
  includeOpportunities: boolean
  includePositiveChanges: boolean
  includeKeyNumbers: boolean
  maxActionItems: number
  minimumMaterialityCents: number
  sendWhenEmpty: boolean
  recipientScope: "owner_only" | "all_authorized_users"
}

export interface OwnersDigestSignal {
  id: string
  source: OwnersDigestSource
  signalType: string
  title: string
  summary: string
  severity: OwnersDigestSeverity
  recommendedAction?: string | null
  actionUrl?: string | null
  whyItMatters?: string | null
  financialImpactCents?: number | null
  currentValue?: number | null
  previousValue?: number | null
  changeValue?: number | null
  changePercent?: number | null
  entityType?: string | null
  entityId?: string | null
  entityName?: string | null
  detectedAt: Date
  correlationKey?: string | null
  metadata?: Record<string, unknown>
}

export interface OwnersDigestMetric {
  key: string
  label: string
  section: "key_numbers"
  unit: "currency_cents" | "percent" | "days" | "weeks" | "count" | "text"
  displayValue: string
  numericValue?: number | null
  monetaryValueCents?: number | null
  previousNumericValue?: number | null
  previousMonetaryValueCents?: number | null
  changeNumericValue?: number | null
  changeMonetaryValueCents?: number | null
  changePercent?: number | null
  sortOrder: number
  metadata?: Record<string, unknown>
}

export interface OwnersDigestProviderResult {
  source: OwnersDigestSource
  status: OwnersDigestProviderStatus
  signals: OwnersDigestSignal[]
  metrics: OwnersDigestMetric[]
  dataAsOf: Date | null
  stale: boolean
  entitled: boolean
  configured: boolean
  available: boolean
  errorCode?: string | null
  errorSummary?: string | null
}

export interface OwnersDigestItem extends OwnersDigestSignal {
  section: OwnersDigestSection
  priorityScore: number
  contributingSources: OwnersDigestSource[]
}

export interface OwnersDigestSnapshotRecord {
  id: string
  frequency: OwnersDigestFrequency
  periodLabel: string
  periodStart: Date
  periodEnd: Date
  status: OwnersDigestStatus
  summary: string
  summaryMode: "deterministic"
  dataAsOf: Date | null
  generatedAt: Date
  lastRegeneratedAt: Date | null
  generationSource: string
  generationState: string
  completenessStatus: "complete" | "partial" | "stale" | "insufficient_data"
  completenessSummary: string | null
  statusReason: string | null
  items: OwnersDigestItem[]
  metrics: OwnersDigestMetric[]
  providers: OwnersDigestProviderResult[]
}

export interface OwnersDigestHistoryEntry {
  id: string
  status: OwnersDigestStatus
  frequency: OwnersDigestFrequency
  periodLabel: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  summary: string
  topAttentionCount: number
}

export interface OwnersDigestEntitlements {
  tier: string
  hasCoreAccess: boolean
  hasEmailAccess: boolean
  hasHistoryAccess: boolean
}

export interface OwnersDigestGenerationResult extends OwnersDigestSnapshotRecord {
  created: boolean
}
