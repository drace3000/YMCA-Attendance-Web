import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("migration: schedule_clone_constraint_events", () => {
  it("exists and creates schedule_clone_constraint_events table", () => {
    const migrationsDir = path.resolve(__dirname, "../../../../supabase/migrations");
    const files = fs.readdirSync(migrationsDir);
    const match = files.find((f) => f.endsWith("_create_schedule_clone_constraint_events.sql"));
    expect(match, "expected create_schedule_clone_constraint_events migration file").toBeTruthy();

    const sql = fs.readFileSync(path.join(migrationsDir, match!), "utf8");
    expect(sql).toMatch(/create table if not exists public\.schedule_clone_constraint_events/i);
    expect(sql).toMatch(/references public\.schedule_clone_audit\(id\) on delete cascade/i);
    expect(sql).toMatch(/alter table public\.schedule_clone_constraint_events enable row level security/i);
  });
});

