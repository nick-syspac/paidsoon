/**
 * Unit tests for lib/admin/diagnostics
 *
 * Tests each check with healthy and unhealthy snapshot data.
 * No DB or external API calls — pure function tests.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"

import { checkCustomFromUnverified } from "@/lib/admin/diagnostics/checks/custom-from-unverified"
import { checkTrialLapsed } from "@/lib/admin/diagnostics/checks/trial-lapsed"
import { checkStripeConnectDisconnected } from "@/lib/admin/diagnostics/checks/stripe-connect-disconnected"
import { checkSyncStale } from "@/lib/admin/diagnostics/checks/sync-stale"
import { checkNoInvoicesTracked } from "@/lib/admin/diagnostics/checks/no-invoices-tracked"
import { runDiagnostics } from "@/lib/admin/diagnostics"
import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { UserProfile, Schedule, EmailSettings, InvoiceConnection, AccountingConnection } from "@/lib/generated/prisma/client"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionCurrentPeriodEnd: null,
    pendingDowngradeTier: null,
    stripeScheduleId: null,
    subscriptionTier: "starter",
    subscriptionStatus: "active",
    trialEndsAt: null,
    onboardingCompletedAt: new Date("2026-01-01"),
    displayName: "Test User",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeEmailSettings(overrides: Partial<EmailSettings> = {}): EmailSettings {
  return {
    id: "es-1",
    userId: "user-1",
    fromEmail: null,
    fromName: null,
    replyTo: null,
    resendVerified: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeStripeConn(overrides: Partial<InvoiceConnection> = {}): InvoiceConnection {
  return {
    id: "ic-1",
    userId: "user-1",
    provider: "stripe",
    stripeConnectAccountId: "acct_test_123",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeAccountingConn(overrides: Partial<AccountingConnection> = {}): AccountingConnection {
  return {
    id: "ac-1",
    userId: "user-1",
    provider: "xero",
    organisationId: "org-1",
    organisationName: "Test Org",
    encryptedAccessToken: "enc-token",
    encryptedRefreshToken: "enc-refresh",
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    scopes: "accounting.transactions",
    status: "active",
    lastSyncedAt: new Date(), // now = recently synced
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<TenantSnapshot> = {}): TenantSnapshot {
  return {
    profile: makeProfile(),
    schedule: null,
    emailSettings: null,
    stripeInvoiceConn: makeStripeConn(),
    accountingConns: [],
    invoiceCounts: { pending: 5, paused: 0, snoozed: 0, sequence_complete: 0, manually_resolved: 0, paid: 0, total: 5 },
    recentEmailLogs: [],
    supabaseEmail: "test@example.com",
    supabaseLastSignIn: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// checkCustomFromUnverified
// ---------------------------------------------------------------------------

describe("checkCustomFromUnverified", () => {
  test("returns null when no emailSettings", () => {
    const result = checkCustomFromUnverified(makeSnapshot({ emailSettings: null }))
    assert.equal(result, null)
  })

  test("returns null when fromEmail is null", () => {
    const result = checkCustomFromUnverified(makeSnapshot({
      emailSettings: makeEmailSettings({ fromEmail: null }),
    }))
    assert.equal(result, null)
  })

  test("returns null when fromEmail is set and domain is verified", () => {
    const result = checkCustomFromUnverified(makeSnapshot({
      emailSettings: makeEmailSettings({ fromEmail: "me@verified.com", resendVerified: true }),
    }))
    assert.equal(result, null)
  })

  test("returns error diagnostic when fromEmail is set and domain is NOT verified", () => {
    const result = checkCustomFromUnverified(makeSnapshot({
      emailSettings: makeEmailSettings({ fromEmail: "me@unverified.com", resendVerified: false }),
    }))
    assert.ok(result !== null)
    assert.equal(result.slug, "custom-from-unverified")
    assert.equal(result.severity, "error")
    assert.equal(result.actions.length, 1)
    assert.equal(result.actions[0].actionSlug, "reset-email-from")
  })
})

// ---------------------------------------------------------------------------
// checkTrialLapsed
// ---------------------------------------------------------------------------

describe("checkTrialLapsed", () => {
  test("returns null when subscriptionStatus is not trialing", () => {
    const result = checkTrialLapsed(makeSnapshot({
      profile: makeProfile({ subscriptionStatus: "active" }),
    }))
    assert.equal(result, null)
  })

  test("returns null when trialing but trialEndsAt is in the future", () => {
    const result = checkTrialLapsed(makeSnapshot({
      profile: makeProfile({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() + 86_400_000), // tomorrow
      }),
    }))
    assert.equal(result, null)
  })

  test("returns null when trialing but trialEndsAt is null", () => {
    const result = checkTrialLapsed(makeSnapshot({
      profile: makeProfile({ subscriptionStatus: "trialing", trialEndsAt: null }),
    }))
    assert.equal(result, null)
  })

  test("returns error diagnostic when trial has lapsed", () => {
    const result = checkTrialLapsed(makeSnapshot({
      profile: makeProfile({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() - 86_400_000), // yesterday
      }),
    }))
    assert.ok(result !== null)
    assert.equal(result.slug, "trial-lapsed")
    assert.equal(result.severity, "error")
    assert.equal(result.actions[0].actionSlug, "extend-trial")
    assert.deepEqual(result.actions[0].payload, { days: 7 })
  })
})

// ---------------------------------------------------------------------------
// checkStripeConnectDisconnected
// ---------------------------------------------------------------------------

describe("checkStripeConnectDisconnected", () => {
  test("returns null when stripe connect is connected", () => {
    const result = checkStripeConnectDisconnected(makeSnapshot({
      stripeInvoiceConn: makeStripeConn(),
    }))
    assert.equal(result, null)
  })

  test("returns warning when stripe connect is null", () => {
    const result = checkStripeConnectDisconnected(makeSnapshot({ stripeInvoiceConn: null }))
    assert.ok(result !== null)
    assert.equal(result.slug, "stripe-connect-disconnected")
    assert.equal(result.severity, "warning")
    assert.equal(result.actions.length, 0)
  })
})

// ---------------------------------------------------------------------------
// checkSyncStale
// ---------------------------------------------------------------------------

describe("checkSyncStale", () => {
  test("returns empty array when no accounting connections", () => {
    const results = checkSyncStale(makeSnapshot({ accountingConns: [] }))
    assert.deepEqual(results, [])
  })

  test("returns empty array when connection is active and recently synced", () => {
    const results = checkSyncStale(makeSnapshot({
      accountingConns: [makeAccountingConn({ status: "active", lastSyncedAt: new Date() })],
    }))
    assert.deepEqual(results, [])
  })

  test("returns warning for connection in error status", () => {
    const results = checkSyncStale(makeSnapshot({
      accountingConns: [makeAccountingConn({ status: "error", lastSyncedAt: new Date() })],
    }))
    assert.equal(results.length, 1)
    assert.equal(results[0].slug, "sync-stale")
    assert.equal(results[0].severity, "warning")
    assert.equal(results[0].actions[0].actionSlug, "trigger-resync")
    assert.deepEqual(results[0].actions[0].payload, { connectionId: "ac-1" })
  })

  test("returns warning for connection in disconnected status", () => {
    const results = checkSyncStale(makeSnapshot({
      accountingConns: [makeAccountingConn({ status: "disconnected" })],
    }))
    assert.equal(results.length, 1)
    assert.equal(results[0].slug, "sync-stale")
  })

  test("returns warning for active connection with lastSyncedAt > 48h ago", () => {
    const staleDate = new Date(Date.now() - 49 * 3600_000)
    const results = checkSyncStale(makeSnapshot({
      accountingConns: [makeAccountingConn({ status: "active", lastSyncedAt: staleDate })],
    }))
    assert.equal(results.length, 1)
    assert.equal(results[0].slug, "sync-stale")
  })

  test("returns one diagnostic per stale connection", () => {
    const staleDate = new Date(Date.now() - 72 * 3600_000)
    const results = checkSyncStale(makeSnapshot({
      accountingConns: [
        makeAccountingConn({ id: "ac-1", status: "active", lastSyncedAt: staleDate }),
        makeAccountingConn({ id: "ac-2", provider: "myob", status: "error", organisationId: "org-2", lastSyncedAt: new Date() }),
      ],
    }))
    assert.equal(results.length, 2)
  })
})

// ---------------------------------------------------------------------------
// checkNoInvoicesTracked
// ---------------------------------------------------------------------------

describe("checkNoInvoicesTracked", () => {
  test("returns null when account is within grace period (< 7 days old)", () => {
    const result = checkNoInvoicesTracked(makeSnapshot({
      profile: makeProfile({ createdAt: new Date(Date.now() - 2 * 86_400_000) }), // 2 days ago
      invoiceCounts: { pending: 0, paused: 0, snoozed: 0, sequence_complete: 0, manually_resolved: 0, paid: 0, total: 0 },
    }))
    assert.equal(result, null)
  })

  test("returns null when account has invoices", () => {
    const result = checkNoInvoicesTracked(makeSnapshot({
      profile: makeProfile({ createdAt: new Date("2026-01-01") }), // old account
      invoiceCounts: { pending: 1, paused: 0, snoozed: 0, sequence_complete: 0, manually_resolved: 0, paid: 0, total: 1 },
    }))
    assert.equal(result, null)
  })

  test("returns info diagnostic for old account with no invoices", () => {
    const result = checkNoInvoicesTracked(makeSnapshot({
      profile: makeProfile({ createdAt: new Date("2026-01-01") }), // old account
      invoiceCounts: { pending: 0, paused: 0, snoozed: 0, sequence_complete: 0, manually_resolved: 0, paid: 0, total: 0 },
    }))
    assert.ok(result !== null)
    assert.equal(result.slug, "no-invoices-tracked")
    assert.equal(result.severity, "info")
    assert.equal(result.actions.length, 0)
  })
})

// ---------------------------------------------------------------------------
// runDiagnostics — sorting
// ---------------------------------------------------------------------------

describe("runDiagnostics", () => {
  test("returns empty array for healthy snapshot", () => {
    const results = runDiagnostics(makeSnapshot({
      emailSettings: null,
      stripeInvoiceConn: makeStripeConn(),
      accountingConns: [makeAccountingConn({ status: "active", lastSyncedAt: new Date() })],
      invoiceCounts: { pending: 5, paused: 0, snoozed: 0, sequence_complete: 0, manually_resolved: 0, paid: 0, total: 5 },
    }))
    assert.deepEqual(results, [])
  })

  test("returns errors before warnings before info", () => {
    const results = runDiagnostics(makeSnapshot({
      profile: makeProfile({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() - 86_400_000), // lapsed — error
        createdAt: new Date("2026-01-01"),
      }),
      emailSettings: makeEmailSettings({ fromEmail: "me@unverified.com", resendVerified: false }), // error
      stripeInvoiceConn: null, // warning
      accountingConns: [makeAccountingConn({ status: "error" })], // warning
      invoiceCounts: { pending: 0, paused: 0, snoozed: 0, sequence_complete: 0, manually_resolved: 0, paid: 0, total: 0 }, // info (old account)
    }))

    // Should have errors first
    const severities = results.map((d) => d.severity)
    const errorIdx = severities.lastIndexOf("error")
    const warnIdx = severities.indexOf("warning")
    const infoIdx = severities.indexOf("info")

    if (warnIdx !== -1) assert.ok(errorIdx < warnIdx, "errors before warnings")
    if (infoIdx !== -1 && warnIdx !== -1) assert.ok(warnIdx < infoIdx, "warnings before info")
  })
})
