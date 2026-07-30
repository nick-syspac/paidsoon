/**
 * Demo accounting-connection guard.
 *
 * The development seed creates `accounting_connections` rows so the Connections
 * UI, sync history and provider-mapping screens can be exercised without a real
 * Xero/MYOB tenant. Those rows deliberately hold placeholder token strings that
 * are NOT valid ciphertext, so any sync attempt would throw during decryption
 * and — worse — could flip the connection to `revoked` or fire a live request at
 * a provider using a seeded organisation id.
 *
 * Seeded connections are marked by a reserved `organisation_id` prefix. Both the
 * per-connection sync and the cron fan-out skip them, so no background worker can
 * ever open a provider connection on seeded data.
 */

/** Reserved prefix applied to `AccountingConnection.organisationId` by the seed. */
export const DEMO_ORGANISATION_ID_PREFIX = "demo-seed:"

/** True when the connection is seed-created demo data and must never be synced. */
export function isDemoOrganisationId(organisationId: string | null | undefined): boolean {
  return typeof organisationId === "string" && organisationId.startsWith(DEMO_ORGANISATION_ID_PREFIX)
}
