import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import pg from "pg"

// Verification only: fixed, TCP-disabled local cluster; never load application env.
const config = { host: "/tmp/paidsoon-commitguard-pg.i62Iri", port: 55437,
  database: "commitguard", user: "syspac", password: () => "", ssl: false as const,
  connectionTimeoutMillis: 3000 }
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

async function snapshot(client: pg.Client): Promise<unknown> {
  const catalog = (await client.query(`SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c),
    'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a),
    'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
    'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p),
    'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t),
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
    'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n),
    'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d),
    'databases',(SELECT jsonb_agg(jsonb_build_array(datname,datacl) ORDER BY datname) FROM pg_database)
  ) snapshot`)).rows[0].snapshot
  const data: unknown[] = []
  for (const { tablename } of (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
    data.push([tablename, (await client.query(`SELECT count(*)::int count,
      md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) digest
      FROM public.${quote(tablename)} t`)).rows[0]])
  }
  return { catalog, data }
}

export async function openCommitGuardVerificationClone(database: string): Promise<() => Promise<void>> {
  assert.match(database, /^commitguard_probe_[a-f0-9]{32}$/)
  const source = new pg.Client(config)
  await source.connect()
  let created = false
  try {
    assert.deepEqual((await source.query(`SELECT current_database() database,current_user role,inet_server_addr() tcp,
      current_setting('unix_socket_directories') socket,current_setting('port') port,
      current_setting('listen_addresses') listen,current_setting('server_version_num')::int/10000 major`)).rows[0],
    { database: "commitguard", role: "syspac", tcp: null, socket: config.host, port: "55437", listen: "", major: 17 })
    const before = await snapshot(source)
    await source.query(`CREATE DATABASE ${quote(database)} TEMPLATE commitguard`)
    created = true
    return async () => {
      try {
        await source.query(`DROP DATABASE ${quote(database)}`)
        assert.deepEqual(await snapshot(source), before,
          "original schema/ACLs, roles, trial/billing data and database inventory unchanged")
        console.log("PASS: template schema/ACLs/roles/data unchanged; probe clone removed")
      } finally { await source.end() }
    }
  } catch (error) {
    try { if (created) await source.query(`DROP DATABASE ${quote(database)}`) }
    finally { await source.end() }
    throw error
  }
}

export const commitGuardVerificationCloneName = () => `commitguard_probe_${randomUUID().replaceAll("-", "")}`