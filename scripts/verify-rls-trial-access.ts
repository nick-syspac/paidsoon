import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { Client } from "pg"
import { resolveSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"
import { assertBillingJournalIndexes, billingJournalIndexes, billingJournalIndexesSql, transactionSqlBody, type BillingJournalIndex } from "@/scripts/verify-rls-billing-artifacts"

// Privileged integration-only setup uses the canonical migration connection.
// All DDL, fixtures and grants roll back, including on an assertion failure.
export async function verifyTrialAccessRls(staged = false, tablesOnly = false, billingMutations = false): Promise<void> {
  assert.ok(!tablesOnly || !billingMutations, "Existing containment probes must not stage customer journals")
  const { directUrl } = resolveSupabaseEnvironment({ mode: "migration", env: process.env })
  const client = new Client({ connectionString: directUrl, connectionTimeoutMillis: 10_000 })
  await client.connect()
  try {
    await client.query("BEGIN")
    await client.query("SET LOCAL statement_timeout = '30s'")
    if (staged) {
      const existing = await client.query("SELECT to_regclass('public.tenant_trial_grants') AS relation")
      if (!existing.rows[0].relation) {
        await client.query(await readFile("prisma/migrations/20261014093943_add_superuser_tenant_trial_access/migration.sql", "utf8"))
      }
      await client.query(await readFile("prisma/tenant-trial-access-policies.sql", "utf8"))
    }
    if (billingMutations && staged) {
      // Future reviewed isolated execution ONLY. All pending artifacts are staged
      // on this connection, never deployed or recorded in migration history.
      // Defaults precede CREATE so journals have no exposed intermediate ACLs.
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated`)
      const lease = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='stripe_billing_webhook_events'
          AND column_name='processing_token') AS present`)
      if (!lease.rows[0].present) {
        await client.query(transactionSqlBody(await readFile("prisma/migrations/20261015060205_add_billing_webhook_processing_lease/migration.sql", "utf8")))
      }
      const journal = await client.query("SELECT to_regclass('public.tenant_billing_mutations') AS relation")
      if (!journal.rows[0].relation) {
        await client.query(transactionSqlBody(await readFile("prisma/migrations/20261015095612_add_tenant_billing_mutation_journal/migration.sql", "utf8")))
      }
      const checks = await client.query(`SELECT conname FROM pg_constraint WHERE
        (conrelid='public.tenant_billing_mutations'::regclass AND conname='tenant_billing_mutations_actor_matches_tenant_check') OR
        (conrelid='public.user_profiles'::regclass AND conname='user_profiles_billing_reservations_exclusive_check')`)
      assert.ok(checks.rowCount === 0 || checks.rowCount === 2, "Partial CHECK deployment requires review, not automatic repair")
      if (checks.rowCount === 0) {
        await client.query(transactionSqlBody(await readFile("prisma/tenant-billing-mutation-constraints.sql", "utf8")))
      }
      await client.query(await readFile("prisma/tenant-billing-mutation-policies.sql", "utf8"))
    }
    if (billingMutations) {
      const indexes = await client.query<BillingJournalIndex>(billingJournalIndexesSql, [billingJournalIndexes.map((index) => index.name)])
      assertBillingJournalIndexes(indexes.rows)
    }
    const users = [randomUUID(), randomUUID()]
    const operations = [randomUUID(), randomUUID()]
    const grants = [randomUUID(), randomUUID()]
    const mutations = [randomUUID(), randomUUID()]
    const steps = [randomUUID(), randomUUID()]
    for (let i = 0; i < users.length; i++) {
      await client.query('INSERT INTO user_profiles (id, "userId", "subscriptionTier", "subscriptionStatus", "updatedAt") VALUES ($1,$1,\'essentials\',\'trialing\',now())', [users[i]])
      await client.query(`INSERT INTO tenant_trial_operations
        (id,user_id,actor_user_id,admin_session_id,input_hash,normalized_input,action,source,
         previous_snapshot,reason,time_zone,preview_version,preview_fingerprint,preview_expires_at,updated_at)
        VALUES ($1,$2,$2,'rls-probe','hash','{}','extend_or_grant','admin_grant',
         '{}','RLS probe','UTC',0,'fingerprint',now()+interval '15 minutes',now())`, [operations[i], users[i]])
      await client.query(`INSERT INTO tenant_trial_grants
        (id,user_id,plan,starts_at,expires_at,creator_operation_id,last_operation_id,updated_at)
        VALUES ($1,$2,'business_control',now(),now()+interval '7 days',$3,$3,now())`, [grants[i], users[i], operations[i]])
      await client.query(`INSERT INTO tenant_billing_risks
        (id,user_id,kind,stripe_object_id,stripe_customer_id,stripe_subscription_id,stripe_status,blocking,reconciled_at,updated_at)
        VALUES ($1,$2,'subscription_invoice',$1,'cus_probe','sub_probe','paid',false,now(),now())`, [randomUUID(), users[i]])
      if (billingMutations) {
        await client.query(`INSERT INTO tenant_billing_mutations
          (id,user_id,actor_user_id,action,input_hash,normalized_input,starting_version,
           starting_binding,starting_fingerprint,updated_at)
          VALUES ($1,$2,$2,'checkout_create','hash','{}',0,'{}','fingerprint',now())`, [mutations[i], users[i]])
        await client.query(`INSERT INTO tenant_billing_mutation_steps
          (id,user_id,mutation_id,step_key,sequence,normalized_request,request_hash,
           method,object_target,stripe_idempotency_key,updated_at)
          VALUES ($1,$2,$3,'session_create',0,'{}','hash','POST','checkout.sessions',$1,now())`, [steps[i], users[i], mutations[i]])
      }
    }

    async function denied(sql: string, values: unknown[] = [], code = "42501"): Promise<void> {
      await client.query("SAVEPOINT denied_probe")
      let actual: string | undefined
      try { await client.query(sql, values) } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error) actual = String(error.code)
      }
      await client.query("ROLLBACK TO SAVEPOINT denied_probe")
      await client.query("RELEASE SAVEPOINT denied_probe")
      assert.equal(actual, code, `Expected SQLSTATE ${code} for denied probe`)
    }

    // Verify tenant-matching references and one-current-grant constraint too.
    await denied("UPDATE tenant_trial_grants SET last_operation_id=$1 WHERE id=$2", [operations[1], grants[0]], "23503")
    await denied("INSERT INTO tenant_trial_grants SELECT $1,user_id,plan,starts_at,expires_at,revoked_at,creator_operation_id,last_operation_id,created_at,updated_at FROM tenant_trial_grants WHERE id=$2", [randomUUID(), grants[0]], "23505")
    if (billingMutations) {
      await denied("UPDATE tenant_billing_mutations SET actor_user_id=$1 WHERE id=$2", [users[1], mutations[0]], "23514")
      await denied("UPDATE tenant_billing_mutations SET user_id=$1,actor_user_id=$1 WHERE id=$2", [randomUUID(), mutations[0]], "23503")
      await denied("UPDATE tenant_billing_mutations SET parent_mutation_id=$1 WHERE id=$2", [mutations[1], mutations[0]], "23503")
      await denied("UPDATE tenant_billing_mutation_steps SET mutation_id=$1 WHERE id=$2", [mutations[1], steps[0]], "23503")
      const child = randomUUID()
      assert.equal((await client.query(`INSERT INTO tenant_billing_mutations
        (id,user_id,actor_user_id,action,input_hash,normalized_input,starting_version,
         starting_binding,starting_fingerprint,parent_mutation_id,updated_at)
        VALUES ($1,$2,$2,'customer_create','hash','{}',0,'{}','fingerprint',$3,now()) RETURNING id`, [child, users[0], mutations[0]])).rowCount, 1)
      assert.equal((await client.query("UPDATE tenant_billing_mutation_steps SET mutation_id=$1 WHERE id=$2 RETURNING id", [child, steps[0]])).rowCount, 1)
      for (let i = 0; i < users.length; i++) {
        const owner = await client.query('UPDATE user_profiles SET pending_trial_operation_id=$1,pending_billing_mutation_id=NULL WHERE "userId"=$2 RETURNING pending_trial_operation_id,pending_billing_mutation_id', [operations[i], users[i]])
        assert.deepEqual(owner.rows[0], { pending_trial_operation_id: operations[i], pending_billing_mutation_id: null })
        await denied('UPDATE user_profiles SET pending_billing_mutation_id=$1 WHERE "userId"=$2', [mutations[i], users[i]], "23514")
        const customer = await client.query('UPDATE user_profiles SET pending_trial_operation_id=NULL,pending_billing_mutation_id=$1 WHERE "userId"=$2 RETURNING pending_trial_operation_id,pending_billing_mutation_id', [mutations[i], users[i]])
        assert.deepEqual(customer.rows[0], { pending_trial_operation_id: null, pending_billing_mutation_id: mutations[i] })
        await denied('UPDATE user_profiles SET pending_trial_operation_id=$1 WHERE "userId"=$2', [operations[i], users[i]], "23514")
      }
      // Catalog checks catch hidden column ACLs, TRUNCATE/REFERENCES grants and
      // PUBLIC inheritance even where ordinary DML probes would be filtered.
      for (const role of ["anon", "authenticated"]) {
        for (const table of ["tenant_trial_operations", "tenant_billing_mutations", "tenant_billing_mutation_steps"]) {
          const acl = await client.query(`SELECT c.relrowsecurity AS rls,
            has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,
            has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access
            FROM pg_class c WHERE c.oid=$2::regclass`, [role, `public.${table}`])
          assert.deepEqual(acl.rows, [{ rls: true, table_access: false, column_access: false }])
        }
      }
      const defaults = await client.query(`SELECT count(*)::int AS grants FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole='postgres'::regrole AND d.defaclobjtype='r'
          AND (d.defaclnamespace=0 OR d.defaclnamespace='public'::regnamespace)
          AND (a.grantee=0 OR a.grantee IN ('anon'::regrole,'authenticated'::regrole))`)
      assert.equal(defaults.rows[0].grants, 0)
    }

    const journalEvidence: Record<string, unknown[]> = {}
    let profileAuthority: unknown[] = []
    if (billingMutations) {
      for (const table of ["tenant_trial_operations", "tenant_billing_mutations", "tenant_billing_mutation_steps"]) {
        journalEvidence[table] = (await client.query(`SELECT * FROM ${table} WHERE user_id=ANY($1::text[]) ORDER BY id`, [users])).rows
      }
      profileAuthority = (await client.query(`SELECT to_jsonb(p) - 'display_name' - 'onboarding_completed_at' - 'updatedAt' AS authority
        FROM user_profiles p WHERE "userId"=ANY($1::text[]) ORDER BY "userId"`, [users])).rows
    }
    const onboardingCompletedAt = new Date()
    const tables = ["tenant_trial_grants", "tenant_billing_risks", "tenant_trial_operations", "tenant_trial_notifications", ...(billingMutations ? ["tenant_billing_mutations", "tenant_billing_mutation_steps"] : []), ...(tablesOnly ? [] : ["admin_audit_events"])]
    for (const role of ["authenticated", "anon"] as const) {
      await client.query(`SET LOCAL ROLE ${role}`)
      for (const userId of users) {
        await client.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: userId, role }), userId])
        if (role === "authenticated") {
          const grantRows = await client.query("SELECT id,user_id,plan,starts_at,expires_at,revoked_at FROM tenant_trial_grants WHERE user_id=ANY($1::text[])", [users])
          assert.deepEqual(grantRows.rows.map((r: { user_id: string }) => r.user_id), [userId])
          const risks = await client.query("SELECT user_id,kind,blocking FROM tenant_billing_risks WHERE user_id=ANY($1::text[])", [users])
          assert.deepEqual(risks.rows.map((r: { user_id: string }) => r.user_id), [userId])
          await denied("SELECT creator_operation_id FROM tenant_trial_grants")
          await denied("SELECT stripe_object_id FROM tenant_billing_risks")
          if (!tablesOnly) {
            const profiles = await client.query('SELECT "userId",display_name FROM user_profiles WHERE "userId"=ANY($1::text[])', [users])
            assert.deepEqual(profiles.rows.map((row: { userId: string }) => row.userId), [userId])
            const updated = await client.query('UPDATE user_profiles SET display_name=\'RLS probe name\',"updatedAt"=now() WHERE "userId"=$1 RETURNING display_name', [userId])
            assert.equal(updated.rowCount, 1)
            assert.equal(updated.rows[0].display_name, "RLS probe name")
            const completed = await client.query('UPDATE user_profiles SET onboarding_completed_at=$1,"updatedAt"=now() WHERE "userId"=$2 RETURNING onboarding_completed_at', [onboardingCompletedAt, userId])
            assert.equal(completed.rowCount, 1)
            assert.deepEqual(completed.rows[0].onboarding_completed_at, onboardingCompletedAt)
            const stranger = users.find((id) => id !== userId)
            assert.equal((await client.query('UPDATE user_profiles SET display_name=\'cross-tenant\' WHERE "userId"=$1 RETURNING id', [stranger])).rowCount, 0)
            assert.equal((await client.query('UPDATE user_profiles SET onboarding_completed_at=NULL,"updatedAt"=now() WHERE "userId"=$1 RETURNING id', [stranger])).rowCount, 0)
          }
        } else {
          await denied("SELECT id FROM tenant_trial_grants")
          await denied("SELECT id FROM tenant_billing_risks")
        }
        for (const table of tables) {
          if (!["tenant_trial_grants", "tenant_billing_risks"].includes(table)) await denied(`SELECT id FROM ${table}`)
          await denied(`INSERT INTO ${table} DEFAULT VALUES`)
          await denied(`UPDATE ${table} SET id=id`)
          await denied(`DELETE FROM ${table}`)
        }
        if (billingMutations) {
          for (const target of users) {
            await denied("SELECT id FROM tenant_trial_operations WHERE user_id=$1", [target])
            await denied("SELECT id FROM tenant_billing_mutations WHERE user_id=$1", [target])
            await denied("SELECT id FROM tenant_billing_mutation_steps WHERE user_id=$1", [target])
            await denied('UPDATE user_profiles SET pending_billing_mutation_id=NULL WHERE "userId"=$1', [target])
          }
        }
        if (!tablesOnly) {
          await denied("INSERT INTO user_profiles DEFAULT VALUES")
          await denied('DELETE FROM user_profiles WHERE "userId"=$1', [userId])
          for (const column of ['"subscriptionTier"', '"subscriptionStatus"', '"stripeCustomerId"', "stripe_subscription_id", "stripe_price_id", "trial_ends_at", "subscription_current_period_start", "subscription_current_period_end", "subscription_cancel_at", "subscription_cancel_at_period_end", "latest_stripe_event_created_at", "pending_downgrade_tier", "stripe_schedule_id", "billing_access_version", "pending_trial_operation_id"]) {
            await denied(`UPDATE user_profiles SET ${column}=${column} WHERE "userId"=$1`, [userId])
          }
        }
      }
      await client.query("RESET ROLE")
    }
    // Denied cross-tenant edits must not have silently touched either row.
    if (!tablesOnly) {
      const profiles = await client.query('SELECT display_name,onboarding_completed_at FROM user_profiles WHERE "userId"=ANY($1::text[])', [users])
      assert.equal(profiles.rowCount, users.length)
      for (const profile of profiles.rows) {
        assert.equal(profile.display_name, "RLS probe name")
        assert.deepEqual(profile.onboarding_completed_at, onboardingCompletedAt)
      }
    }
    if (billingMutations) {
      const reservations = await client.query('SELECT "userId",pending_trial_operation_id,pending_billing_mutation_id FROM user_profiles WHERE "userId"=ANY($1::text[])', [users])
      for (const [table, evidence] of Object.entries(journalEvidence)) {
        assert.deepEqual((await client.query(`SELECT * FROM ${table} WHERE user_id=ANY($1::text[]) ORDER BY id`, [users])).rows, evidence)
      }
      assert.deepEqual((await client.query(`SELECT to_jsonb(p) - 'display_name' - 'onboarding_completed_at' - 'updatedAt' AS authority
        FROM user_profiles p WHERE "userId"=ANY($1::text[]) ORDER BY "userId"`, [users])).rows, profileAuthority)
      for (const row of reservations.rows) {
        assert.equal(row.pending_trial_operation_id, null)
        assert.equal(row.pending_billing_mutation_id, mutations[users.indexOf(row.userId)])
      }
      assert.equal((await client.query("SELECT id FROM tenant_billing_mutations WHERE user_id=ANY($1::text[])", [users])).rowCount, 3)
      assert.equal((await client.query("SELECT id FROM tenant_billing_mutation_steps WHERE user_id=ANY($1::text[])", [users])).rowCount, 2)
    }
    console.log(tablesOnly
      ? "PASS: four trial tables enforce tenant-safe reads and deny customer/anonymous writes/private data; all fixtures roll back. Profile restrictions not tested."
      : billingMutations
        ? "PASS: seven journal index definitions, tenant/actor/CHECK constraints and journal ACLs hold, safe reads/name/onboarding edits remain; all staged artifacts and fixtures roll back."
        : "PASS: trial grants/risk are tenant-scoped, authority writes and private data denied; all probe changes roll back.")
  } finally {
    try { await client.query("ROLLBACK") } finally { await client.end() }
  }
}