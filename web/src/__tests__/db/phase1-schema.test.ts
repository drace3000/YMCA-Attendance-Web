// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"

const defaultLocalDbUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"

const dbUrl = process.env.TEST_DATABASE_URL ?? defaultLocalDbUrl
const runDbTests = process.env.RUN_DB_TESTS === "1"

describe(runDbTests ? "Phase 1 - DB schema" : "Phase 1 - DB schema (skipped)", () => {
  const client = new Client({ connectionString: dbUrl })

  beforeAll(async () => {
    if (!runDbTests) return
    await client.connect()
  })

  afterAll(async () => {
    if (!runDbTests) return
    await client.end()
  })

  it(runDbTests ? "has required columns + defaults" : "skipped", async () => {
    if (!runDbTests) return

    const { rows } = await client.query<{
      column_name: string
      column_default: string | null
      is_nullable: "YES" | "NO"
    }>(`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'branch_schedule_recipients'
        and column_name in ('auth_user_id','is_active','needs_password_setup','last_login_at')
      order by column_name asc
    `)

    const byName = new Map(rows.map((r) => [r.column_name, r]))

    expect(byName.has("auth_user_id")).toBe(true)
    expect(byName.has("is_active")).toBe(true)
    expect(byName.has("needs_password_setup")).toBe(true)
    expect(byName.has("last_login_at")).toBe(true)

    // Defaults can vary in formatting (e.g., true / (true) / ((true)))
    expect(byName.get("is_active")?.column_default?.toLowerCase()).toContain("true")
    expect(byName.get("needs_password_setup")?.column_default?.toLowerCase()).toContain("true")
  })

  it(runDbTests ? "has auth_user_id index" : "skipped", async () => {
    if (!runDbTests) return

    const { rows } = await client.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'branch_schedule_recipients'
        and indexname = 'idx_recipients_auth_user_id'
    `)

    expect(rows.length).toBe(1)
  })

  it(runDbTests ? "enforces case-insensitive unique email index" : "skipped", async () => {
    if (!runDbTests) return

    const { rows } = await client.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'branch_schedule_recipients'
        and indexname = 'idx_recipients_email_unique_ci'
    `)

    expect(rows.length).toBe(1)
  })
})

